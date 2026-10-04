-- TripCanvas schema: Auth profiles, trips, itinerary, bookings, budget, collaboration.
-- Apply in the Supabase SQL editor or with `supabase db push`.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null default '',
  avatar text not null default ''
);

create table if not exists public.places (
  id text primary key,
  destination_id text not null,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  address text not null default '',
  category text not null,
  image text not null default '',
  rating numeric not null default 0,
  duration_min integer not null default 60,
  indoor boolean not null default false,
  about text not null default '',
  open_hour integer not null default 9,
  close_hour integer not null default 18
);

create table if not exists public.trips (
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  destination text not null,
  destination_id text not null,
  start_date date not null,
  end_date date not null,
  cover_image text not null default '',
  currency text not null default 'USD',
  timezone text not null default 'UTC',
  slug text not null unique,
  is_public boolean not null default false,
  budget_amount numeric not null default 0,
  traveler_count integer not null default 1,
  center_lat double precision not null,
  center_lng double precision not null
);

create table if not exists public.trip_members (
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (trip_id, user_id)
);

create table if not exists public.days (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  date date not null,
  note text not null default ''
);

create table if not exists public.activities (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  day_id text not null references public.days (id) on delete cascade,
  place_id text references public.places (id) on delete set null,
  title text not null,
  start_time text not null,
  duration integer not null default 60,
  position integer not null default 0,
  note text not null default '',
  planned_cost numeric not null default 0,
  actual_cost numeric,
  status text not null default 'planned'
);

create table if not exists public.saved_places (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  place_id text not null references public.places (id) on delete cascade,
  note text not null default '',
  unique (trip_id, place_id)
);

create table if not exists public.bookings (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  type text not null check (type in ('flight', 'hotel', 'ticket', 'train', 'other')),
  title text not null,
  reference text not null default '',
  start_at timestamptz not null,
  attachment_url text,
  attachment_name text,
  notes text not null default ''
);

create table if not exists public.expenses (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  title text not null,
  amount numeric not null,
  planned_amount numeric not null default 0,
  category text not null check (category in ('Hotel', 'Food', 'Transport', 'Activities', 'Shopping')),
  paid_by uuid not null references public.profiles (id),
  activity_id text references public.activities (id) on delete set null
);

create table if not exists public.expense_shares (
  id text primary key,
  expense_id text not null references public.expenses (id) on delete cascade,
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric not null
);

create table if not exists public.comments (
  id text primary key,
  activity_id text not null references public.activities (id) on delete cascade,
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists activities_trip_idx on public.activities (trip_id, position);
create index if not exists days_trip_idx on public.days (trip_id, date);

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.days enable row level security;
alter table public.activities enable row level security;
alter table public.saved_places enable row level security;
alter table public.bookings enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.comments enable row level security;
alter table public.activity_events enable row level security;

create or replace function public.is_trip_member(tid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = tid and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_trip(tid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = tid and m.user_id = auth.uid() and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_trip_owner(tid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = tid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function public.trip_is_public(tid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.trips t where t.id = tid and t.is_public);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    ''
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create policy "profiles are readable" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (id = auth.uid());
create policy "places are readable" on public.places for select using (true);
create policy "editors upsert places" on public.places for insert with check (auth.uid() is not null);
create policy "editors update places" on public.places for update using (auth.uid() is not null);

create policy "read trips" on public.trips for select using (is_public or public.is_trip_member(id));
create policy "create trips" on public.trips for insert with check (owner_id = auth.uid());
create policy "edit trips" on public.trips for update using (public.can_edit_trip(id));
create policy "owner deletes trips" on public.trips for delete using (public.is_trip_owner(id));

create policy "read members" on public.trip_members for select using (public.is_trip_member(trip_id) or public.trip_is_public(trip_id));
create policy "owner or self joins" on public.trip_members for insert with check (
  (user_id = auth.uid() and role = 'owner' and exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()))
  or (user_id = auth.uid() and role = 'viewer')
);
create policy "owner updates roles" on public.trip_members for update using (public.is_trip_owner(trip_id));
create policy "owner removes members" on public.trip_members for delete using (public.is_trip_owner(trip_id) or user_id = auth.uid());

create policy "read days" on public.days for select using (public.is_trip_member(trip_id) or public.trip_is_public(trip_id));
create policy "edit days" on public.days for all using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create policy "read activities" on public.activities for select using (public.is_trip_member(trip_id) or public.trip_is_public(trip_id));
create policy "edit activities" on public.activities for all using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create policy "read saved" on public.saved_places for select using (public.is_trip_member(trip_id) or public.trip_is_public(trip_id));
create policy "edit saved" on public.saved_places for all using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create policy "read bookings" on public.bookings for select using (public.is_trip_member(trip_id) or public.trip_is_public(trip_id));
create policy "edit bookings" on public.bookings for all using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create policy "read expenses" on public.expenses for select using (public.is_trip_member(trip_id) or public.trip_is_public(trip_id));
create policy "edit expenses" on public.expenses for all using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create policy "read shares" on public.expense_shares for select using (public.is_trip_member(trip_id) or public.trip_is_public(trip_id));
create policy "edit shares" on public.expense_shares for all using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create policy "read comments" on public.comments for select using (public.is_trip_member(trip_id) or public.trip_is_public(trip_id));
create policy "edit comments" on public.comments for all using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));

create policy "read events" on public.activity_events for select using (public.is_trip_member(trip_id) or public.trip_is_public(trip_id));
create policy "edit events" on public.activity_events for insert with check (public.is_trip_member(trip_id));

alter table public.activities replica identity full;
alter table public.comments replica identity full;
alter table public.expenses replica identity full;
alter table public.days replica identity full;
alter table public.activity_events replica identity full;
alter table public.bookings replica identity full;
alter table public.saved_places replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table public.activities; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.comments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.expenses; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.days; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.activity_events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.bookings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.saved_places; exception when duplicate_object then null; end;
end $$;

insert into storage.buckets (id, name, public)
values ('booking-files', 'booking-files', false)
on conflict (id) do nothing;

create policy "members read booking files"
on storage.objects for select to authenticated
using (
  bucket_id = 'booking-files'
  and (public.is_trip_member((storage.foldername(name))[1]) or public.trip_is_public((storage.foldername(name))[1]))
);

create policy "editors upload booking files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'booking-files'
  and public.can_edit_trip((storage.foldername(name))[1])
);

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
