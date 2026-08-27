-- ==============================================================================
-- TRAVEL DIARY: CONSOLIDATED DATABASE BLUEPRINT (SUPABASE / POSTGRESQL)
-- ==============================================================================
-- This script represents the complete, consolidated schema for the Travel Diary app.
-- It includes Trips (with status & duration), Itinerary Items (pre-trip scaffold),
-- Photos, Jots, Landmarks, Restaurants, and Storage Bucket configuration with RLS.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TRIPS TABLE
-- ------------------------------------------------------------------------------
create table if not exists trips (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  city_name text not null,
  country text,
  lat double precision not null,
  lng double precision not null,
  visit_date date,
  end_date date,
  status text check (status in ('future', 'current', 'past')) default 'past',
  cover_photo_url text,
  created_at timestamptz default now()
);

alter table trips enable row level security;

create policy "Users manage own trips" on trips
  for all using (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. ITINERARY ITEMS TABLE (Pre-Trip Planning & Logging Scaffold)
-- ------------------------------------------------------------------------------
create table if not exists itinerary_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  item_date date,
  start_time time,
  end_time time,
  location text,
  transit_route text,
  ticket_info text,
  category text default 'activity',
  notes text,
  completed boolean default false,
  created_at timestamptz default now()
);

alter table itinerary_items enable row level security;

create policy "Users manage own itinerary items" on itinerary_items
  for all using (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. PHOTOS TABLE (With optional link to an Itinerary Slot)
-- ------------------------------------------------------------------------------
create table if not exists photos (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  itinerary_item_id uuid references itinerary_items(id) on delete set null,
  storage_path text not null,
  url text not null,
  lat double precision,
  lng double precision,
  taken_at timestamptz,
  ai_tags jsonb,
  created_at timestamptz default now()
);

alter table photos enable row level security;

create policy "Users manage own photos" on photos
  for all using (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. JOTS TABLE (Quick notes, thoughts & journal entries)
-- ------------------------------------------------------------------------------
create table if not exists jots (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  itinerary_item_id uuid references itinerary_items(id) on delete set null,
  content text not null,
  created_at timestamptz default now()
);

alter table jots enable row level security;

create policy "Users manage own jots" on jots
  for all using (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 5. LANDMARKS TABLE (Highlights & visited attractions)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 6. RESTAURANTS TABLE (Food reviews, ratings, cuisine, recommendations & dates)
-- ------------------------------------------------------------------------------
create table if not exists restaurants (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  itinerary_item_id uuid references itinerary_items(id) on delete set null,
  name text not null,
  rating integer check (rating between 1 and 5),
  notes text,
  cuisine text,
  recommended boolean default false,
  visit_date date,
  source text default 'manual',
  created_at timestamptz default now()
);

alter table restaurants enable row level security;

create policy "Users manage own restaurants" on restaurants
  for all using (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 7. STORAGE BUCKET CONFIGURATION & POLICIES
-- ------------------------------------------------------------------------------
-- Create public photos bucket
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
  on conflict (id) do nothing;

create policy "Users upload own photos" on storage.objects
  for insert with check (auth.uid()::text = (storage.foldername(name))[1]);

create policy "Public photo read" on storage.objects
  for select using (bucket_id = 'photos');

create policy "Users delete own photos" on storage.objects
  for delete using (auth.uid()::text = (storage.foldername(name))[1]);