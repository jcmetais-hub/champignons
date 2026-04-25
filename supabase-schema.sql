-- Coins Champignons - Schema Supabase
-- A executer dans Supabase > SQL Editor > New query.

create extension if not exists "pgcrypto";

create table if not exists public.pois (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Coin sans nom',
  category text not null default 'autre' check (category in ('cepe', 'girolle', 'morille', 'autre')),
  latitude double precision not null,
  longitude double precision not null,
  commune text,
  date timestamptz not null,
  comment text,
  photo_path text,
  audio_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.poi_shares (
  id uuid primary key default gen_random_uuid(),
  poi_id uuid not null references public.pois(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with_email text not null,
  created_at timestamptz not null default now(),
  unique (poi_id, shared_with_email)
);

create index if not exists pois_user_id_idx on public.pois(user_id);
create index if not exists pois_created_at_idx on public.pois(created_at desc);
create index if not exists poi_shares_email_idx on public.poi_shares(lower(shared_with_email));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pois_set_updated_at on public.pois;
create trigger pois_set_updated_at
before update on public.pois
for each row
execute function public.set_updated_at();

alter table public.pois enable row level security;
alter table public.poi_shares enable row level security;

drop policy if exists "Users can read their own POI" on public.pois;
create policy "Users can read their own POI"
on public.pois
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read POI shared with their email" on public.pois;
create policy "Users can read POI shared with their email"
on public.pois
for select
to authenticated
using (
  exists (
    select 1
    from public.poi_shares shares
    where shares.poi_id = pois.id
      and lower(shares.shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Users can insert their own POI" on public.pois;
create policy "Users can insert their own POI"
on public.pois
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own POI" on public.pois;
create policy "Users can update their own POI"
on public.pois
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own POI" on public.pois;
create policy "Users can delete their own POI"
on public.pois
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read shares they own or receive" on public.poi_shares;
create policy "Users can read shares they own or receive"
on public.poi_shares
for select
to authenticated
using (
  owner_id = auth.uid()
  or lower(shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "Users can share their own POI" on public.poi_shares;
create policy "Users can share their own POI"
on public.poi_shares
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.pois
    where pois.id = poi_id
      and pois.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own shares" on public.poi_shares;
create policy "Users can delete their own shares"
on public.poi_shares
for delete
to authenticated
using (owner_id = auth.uid());

insert into storage.buckets (id, name, public)
values
  ('poi-photos', 'poi-photos', false),
  ('poi-audio', 'poi-audio', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload their own POI photos" on storage.objects;
create policy "Users can upload their own POI photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'poi-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read their own POI photos" on storage.objects;
create policy "Users can read their own POI photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'poi-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own POI photos" on storage.objects;
create policy "Users can update their own POI photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'poi-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own POI photos" on storage.objects;
create policy "Users can delete their own POI photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'poi-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload their own POI audio" on storage.objects;
create policy "Users can upload their own POI audio"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'poi-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read their own POI audio" on storage.objects;
create policy "Users can read their own POI audio"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'poi-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own POI audio" on storage.objects;
create policy "Users can update their own POI audio"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'poi-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own POI audio" on storage.objects;
create policy "Users can delete their own POI audio"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'poi-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);
