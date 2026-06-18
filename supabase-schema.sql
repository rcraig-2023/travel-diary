-- Run this entire file in your Supabase project's SQL Editor

-- TRIPS
create table if not exists trips (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  city_name text not null,
  country text,
  lat double precision not null,
  lng double precision not null,
  visit_date date,
  cover_photo_url text,
  created_at timestamptz default now()
);
alter table trips enable row level security;
create policy "Users manage own trips" on trips
  for all using (auth.uid() = user_id);

-- PHOTOS
create table if not exists photos (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  storage_path text not null,
  url text not null,
  ai_tags jsonb,
  created_at timestamptz default now()
);
alter table photos enable row level security;
create policy "Users manage own photos" on photos
  for all using (auth.uid() = user_id);

-- JOTS
create table if not exists jots (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);
alter table jots enable row level security;
create policy "Users manage own jots" on jots
  for all using (auth.uid() = user_id);

-- LANDMARKS
create table if not exists landmarks (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  visited boolean default false,
  source text default 'manual',
  created_at timestamptz default now()
);
alter table landmarks enable row level security;
create policy "Users manage own landmarks" on landmarks
  for all using (auth.uid() = user_id);

-- RESTAURANTS
create table if not exists restaurants (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  rating integer check (rating between 1 and 5),
  notes text,
  source text default 'manual',
  created_at timestamptz default now()
);
alter table restaurants enable row level security;
create policy "Users manage own restaurants" on restaurants
  for all using (auth.uid() = user_id);

-- STORAGE BUCKET
-- Go to Storage in your Supabase dashboard and create a bucket named "photos"
-- Set it to Public (so photo URLs work without expiry)
-- Then add this storage policy in the SQL editor:
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
  on conflict (id) do nothing;

create policy "Users upload own photos" on storage.objects
  for insert with check (auth.uid()::text = (storage.foldername(name))[1]);

create policy "Public photo read" on storage.objects
  for select using (bucket_id = 'photos');

create policy "Users delete own photos" on storage.objects
  for delete using (auth.uid()::text = (storage.foldername(name))[1]);
