-- Invite tokens, atomic trip creation, and a public itinerary that does not expose private rows.
-- Apply after 0001_init.sql.

alter table public.trips add column if not exists revision integer not null default 0;
alter table public.trips add column if not exists fx_rates jsonb not null default '{}'::jsonb;

create table if not exists public.trip_invites (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  token text not null unique,
  role text not null check (role in ('editor', 'viewer')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer not null default 20,
  used_count integer not null default 0
);

alter table public.trip_invites enable row level security;

drop policy if exists "editors read invites" on public.trip_invites;
create policy "editors read invites" on public.trip_invites
  for select using (public.can_edit_trip(trip_id));

drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "profiles readable by self or trip mates" on public.profiles;
create policy "profiles readable by self or trip mates" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.trip_members mine
      join public.trip_members theirs on theirs.trip_id = mine.trip_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

drop policy if exists "read trips" on public.trips;
create policy "read trips" on public.trips for select using (public.is_trip_member(id));

drop policy if exists "read members" on public.trip_members;
create policy "read members" on public.trip_members for select using (public.is_trip_member(trip_id));

drop policy if exists "read days" on public.days;
create policy "read days" on public.days for select using (public.is_trip_member(trip_id));

drop policy if exists "read activities" on public.activities;
create policy "read activities" on public.activities for select using (public.is_trip_member(trip_id));

drop policy if exists "read saved" on public.saved_places;
create policy "read saved" on public.saved_places for select using (public.is_trip_member(trip_id));

drop policy if exists "read bookings" on public.bookings;
create policy "read bookings" on public.bookings for select using (public.is_trip_member(trip_id));

drop policy if exists "read expenses" on public.expenses;
create policy "read expenses" on public.expenses for select using (public.is_trip_member(trip_id));

drop policy if exists "read shares" on public.expense_shares;
create policy "read shares" on public.expense_shares for select using (public.is_trip_member(trip_id));

drop policy if exists "read comments" on public.comments;
create policy "read comments" on public.comments for select using (public.is_trip_member(trip_id));

drop policy if exists "read events" on public.activity_events;
create policy "read events" on public.activity_events for select using (public.is_trip_member(trip_id));

drop policy if exists "members read booking files" on storage.objects;
create policy "members read booking files"
on storage.objects for select to authenticated
using (
  bucket_id = 'booking-files'
  and public.is_trip_member((storage.foldername(name))[1])
);

create or replace function public.slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.trips where slug = p_slug);
$$;

create or replace function public.create_trip(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.trips;
  day jsonb;
  chosen text;
  n integer := 2;
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;
  if (payload->>'end_date') < (payload->>'start_date') then
    raise exception 'end before start';
  end if;
  chosen := coalesce(nullif(payload->>'slug', ''), 'trip');
  while exists (select 1 from public.trips where slug = chosen) loop
    chosen := coalesce(nullif(payload->>'slug', ''), 'trip') || '-' || n;
    n := n + 1;
  end loop;
  insert into public.trips (
    id, owner_id, title, destination, destination_id, start_date, end_date,
    cover_image, currency, timezone, slug, is_public, budget_amount, traveler_count,
    center_lat, center_lng, revision, fx_rates
  ) values (
    payload->>'id',
    auth.uid(),
    payload->>'title',
    payload->>'destination',
    payload->>'destination_id',
    (payload->>'start_date')::date,
    (payload->>'end_date')::date,
    coalesce(payload->>'cover_image', ''),
    coalesce(payload->>'currency', 'USD'),
    coalesce(payload->>'timezone', 'UTC'),
    chosen,
    false,
    coalesce((payload->>'budget_amount')::numeric, 1500),
    coalesce((payload->>'traveler_count')::integer, 1),
    (payload->>'center_lat')::double precision,
    (payload->>'center_lng')::double precision,
    0,
    '{}'::jsonb
  ) returning * into row;
  insert into public.trip_members (trip_id, user_id, role)
  values (row.id, auth.uid(), 'owner');
  for day in select * from jsonb_array_elements(coalesce(payload->'days', '[]'::jsonb))
  loop
    insert into public.days (id, trip_id, date, note)
    values (day->>'id', row.id, (day->>'date')::date, coalesce(day->>'note', ''));
  end loop;
  return jsonb_build_object(
    'id', row.id,
    'owner_id', row.owner_id,
    'title', row.title,
    'destination', row.destination,
    'destination_id', row.destination_id,
    'start_date', row.start_date,
    'end_date', row.end_date,
    'cover_image', row.cover_image,
    'currency', row.currency,
    'timezone', row.timezone,
    'slug', row.slug,
    'is_public', row.is_public,
    'budget_amount', row.budget_amount,
    'traveler_count', row.traveler_count,
    'center_lat', row.center_lat,
    'center_lng', row.center_lng,
    'revision', row.revision,
    'fx_rates', row.fx_rates
  );
end;
$$;

create or replace function public.create_trip_invite(p_trip_id text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.trip_invites;
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;
  if not public.can_edit_trip(p_trip_id) then
    raise exception 'cannot invite';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'bad role';
  end if;
  insert into public.trip_invites (id, trip_id, token, role, created_by, expires_at, max_uses, used_count)
  values (
    'inv_' || replace(gen_random_uuid()::text, '-', ''),
    p_trip_id,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    p_role,
    auth.uid(),
    now() + interval '14 days',
    20,
    0
  ) returning * into created;
  return jsonb_build_object(
    'id', created.id,
    'trip_id', created.trip_id,
    'token', created.token,
    'role', created.role,
    'created_by', created.created_by,
    'expires_at', created.expires_at,
    'max_uses', created.max_uses,
    'used_count', created.used_count
  );
end;
$$;

create or replace function public.accept_trip_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.trip_invites;
  row public.trips;
  already boolean;
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;
  select * into inv from public.trip_invites where token = p_token for update;
  if not found then
    raise exception 'invite not found';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite expired';
  end if;
  select exists (
    select 1 from public.trip_members m where m.trip_id = inv.trip_id and m.user_id = auth.uid()
  ) into already;
  if not already then
    if inv.used_count >= inv.max_uses then
      raise exception 'invite used up';
    end if;
    insert into public.trip_members (trip_id, user_id, role)
    values (inv.trip_id, auth.uid(), inv.role);
    update public.trip_invites set used_count = used_count + 1 where id = inv.id;
  end if;
  select * into row from public.trips where id = inv.trip_id;
  return jsonb_build_object(
    'id', row.id,
    'owner_id', row.owner_id,
    'title', row.title,
    'destination', row.destination,
    'destination_id', row.destination_id,
    'start_date', row.start_date,
    'end_date', row.end_date,
    'cover_image', row.cover_image,
    'currency', row.currency,
    'timezone', row.timezone,
    'slug', row.slug,
    'is_public', row.is_public,
    'budget_amount', row.budget_amount,
    'traveler_count', row.traveler_count,
    'center_lat', row.center_lat,
    'center_lng', row.center_lng,
    'revision', row.revision,
    'fx_rates', row.fx_rates
  );
end;
$$;

create or replace function public.get_public_trip(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row public.trips;
  owner_name text;
  owner_avatar text;
begin
  select * into row from public.trips where slug = p_slug and is_public;
  if not found then
    return null;
  end if;
  select p.name, p.avatar into owner_name, owner_avatar
  from public.profiles p where p.id = row.owner_id;
  return jsonb_build_object(
    'trip', jsonb_build_object(
      'id', row.id,
      'title', row.title,
      'destination', row.destination,
      'destinationId', row.destination_id,
      'startDate', row.start_date,
      'endDate', row.end_date,
      'coverImage', row.cover_image,
      'timezone', row.timezone,
      'slug', row.slug,
      'centerLat', row.center_lat,
      'centerLng', row.center_lng
    ),
    'owner', jsonb_build_object(
      'name', coalesce(owner_name, 'Someone'),
      'avatar', coalesce(owner_avatar, '')
    ),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'tripId', d.trip_id, 'date', d.date, 'note', ''
      ) order by d.date)
      from public.days d where d.trip_id = row.id
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'dayId', a.day_id,
        'placeId', a.place_id,
        'title', a.title,
        'startTime', left(a.start_time, 5),
        'duration', a.duration,
        'position', a.position
      ) order by a.position)
      from public.activities a where a.trip_id = row.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.slug_available(text) from public;
revoke all on function public.create_trip(jsonb) from public;
revoke all on function public.create_trip_invite(text, text) from public;
revoke all on function public.accept_trip_invite(text) from public;
revoke all on function public.get_public_trip(text) from public;
grant execute on function public.slug_available(text) to authenticated;
grant execute on function public.create_trip(jsonb) to authenticated;
grant execute on function public.create_trip_invite(text, text) to authenticated;
grant execute on function public.accept_trip_invite(text) to authenticated;
grant execute on function public.get_public_trip(text) to anon, authenticated;
