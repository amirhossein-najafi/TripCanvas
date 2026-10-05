-- Bookings, snapshots, votes, participants, and atomic board moves.

alter table public.bookings add column if not exists barcode_value text;
alter table public.bookings add column if not exists barcode_type text not null default 'qr';

alter table public.saved_places add column if not exists priority text not null default 'nice';
alter table public.saved_places drop constraint if exists saved_places_priority_check;
alter table public.saved_places add constraint saved_places_priority_check check (priority in ('must', 'nice', 'skip'));

alter table public.expenses add column if not exists currency text not null default 'USD';
alter table public.expenses add column if not exists participant_id text;
alter table public.expense_shares add column if not exists participant_id text;

create table if not exists public.trip_snapshots (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  revision integer not null,
  label text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.place_votes (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  place_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote text not null check (vote in ('up', 'down')),
  unique (trip_id, place_id, user_id)
);

create table if not exists public.participants (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  name text not null,
  user_id uuid references public.profiles (id) on delete set null
);

alter table public.trip_snapshots enable row level security;
alter table public.place_votes enable row level security;
alter table public.participants enable row level security;

drop policy if exists "read snapshots" on public.trip_snapshots;
create policy "read snapshots" on public.trip_snapshots for select using (public.is_trip_member(trip_id));
drop policy if exists "edit snapshots" on public.trip_snapshots;
create policy "edit snapshots" on public.trip_snapshots for insert with check (public.can_edit_trip(trip_id));

drop policy if exists "read votes" on public.place_votes;
create policy "read votes" on public.place_votes for select using (public.is_trip_member(trip_id));
drop policy if exists "edit votes" on public.place_votes;
create policy "edit votes" on public.place_votes for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id) and user_id = auth.uid());

drop policy if exists "read participants" on public.participants;
create policy "read participants" on public.participants for select using (public.is_trip_member(trip_id));
drop policy if exists "edit participants" on public.participants;
create policy "edit participants" on public.participants for all using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create or replace function public.touch_trip_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid text;
begin
  tid := coalesce(new.trip_id, old.trip_id);
  update public.trips set revision = revision + 1 where id = tid;
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_activities on public.activities;
create trigger touch_activities after insert or update or delete on public.activities
for each row execute function public.touch_trip_revision();
drop trigger if exists touch_saved on public.saved_places;
create trigger touch_saved after insert or update or delete on public.saved_places
for each row execute function public.touch_trip_revision();
drop trigger if exists touch_bookings on public.bookings;
create trigger touch_bookings after insert or update or delete on public.bookings
for each row execute function public.touch_trip_revision();
drop trigger if exists touch_expenses on public.expenses;
create trigger touch_expenses after insert or update or delete on public.expenses
for each row execute function public.touch_trip_revision();

create or replace function public.move_saved_place_to_day(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tid text := payload->>'trip_id';
  pid text := payload->>'place_id';
begin
  if not public.can_edit_trip(tid) then
    raise exception 'cannot edit';
  end if;
  if not exists (select 1 from public.saved_places where trip_id = tid and place_id = pid) then
    raise exception 'place is not in ideas';
  end if;
  delete from public.saved_places where trip_id = tid and place_id = pid;
  insert into public.activities (
    id, trip_id, day_id, place_id, title, start_time, duration, position, note, planned_cost, actual_cost, status
  ) values (
    payload->>'id',
    tid,
    payload->>'day_id',
    pid,
    payload->>'title',
    payload->>'start_time',
    coalesce((payload->>'duration')::integer, 60),
    coalesce((payload->>'position')::integer, 0),
    coalesce(payload->>'note', ''),
    coalesce((payload->>'planned_cost')::numeric, 0),
    null,
    'planned'
  );
  return payload;
end;
$$;

create or replace function public.move_activity_to_ideas(p_trip_id text, p_activity_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  act public.activities;
begin
  if not public.can_edit_trip(p_trip_id) then
    raise exception 'cannot edit';
  end if;
  select * into act from public.activities where id = p_activity_id and trip_id = p_trip_id;
  if not found then
    raise exception 'activity not found';
  end if;
  if act.place_id is not null and not exists (
    select 1 from public.saved_places where trip_id = p_trip_id and place_id = act.place_id
  ) then
    insert into public.saved_places (id, trip_id, place_id, note, priority)
    values ('save_' || replace(gen_random_uuid()::text, '-', ''), p_trip_id, act.place_id, '', 'nice');
  end if;
  delete from public.activities where id = p_activity_id;
end;
$$;

revoke all on function public.move_saved_place_to_day(jsonb) from public;
revoke all on function public.move_activity_to_ideas(text, text) from public;
grant execute on function public.move_saved_place_to_day(jsonb) to authenticated;
grant execute on function public.move_activity_to_ideas(text, text) to authenticated;

alter table public.place_votes replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.place_votes; exception when duplicate_object then null; end;
end $$;
