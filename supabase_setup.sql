-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. LABELS TABLE
create table if not exists public.labels (
  id text primary key, -- Text to allow custom IDs like 'trabajo' or UUIDs
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  notes text default '',
  daily_notes text default '',
  open_tabs jsonb default '["global", "instance"]'::jsonb,
  trashed_tabs jsonb default '[]'::jsonb,
  custom_tabs jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. SCHEDULE ENTRIES TABLE
create table if not exists public.schedule_entries (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day_index integer not null, -- 0-6
  slot_index integer not null, -- Depends on stepMinutes config
  label_id text references public.labels(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, day_index, slot_index) -- Unique constraint for upsert
);

-- 3. INSTANCE NOTES TABLE
create table if not exists public.instance_notes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null, -- Format: "dayIndex-slotIndex"
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, key) -- Unique constraint for upsert
);

-- 4. STORIES TABLE
create table if not exists public.stories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day_index integer not null,
  hour integer not null,
  minute integer not null,
  title text not null,
  content text not null,
  status text check (status in ('pending', 'triggered', 'viewed')) default 'pending',
  created_at bigint not null -- Store as timestamp number
);

-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enable RLS on all tables
alter table public.labels enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.instance_notes enable row level security;
alter table public.stories enable row level security;

-- Policies for LABELS
create policy "Users can view their own labels" on public.labels
  for select using (auth.uid() = user_id);

create policy "Users can insert their own labels" on public.labels
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own labels" on public.labels
  for update using (auth.uid() = user_id);

create policy "Users can delete their own labels" on public.labels
  for delete using (auth.uid() = user_id);

-- Policies for SCHEDULE ENTRIES
create policy "Users can view their own schedule" on public.schedule_entries
  for select using (auth.uid() = user_id);

create policy "Users can insert their own schedule" on public.schedule_entries
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own schedule" on public.schedule_entries
  for update using (auth.uid() = user_id);

create policy "Users can delete their own schedule" on public.schedule_entries
  for delete using (auth.uid() = user_id);

-- Policies for INSTANCE NOTES
create policy "Users can view their own notes" on public.instance_notes
  for select using (auth.uid() = user_id);

create policy "Users can insert their own notes" on public.instance_notes
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own notes" on public.instance_notes
  for update using (auth.uid() = user_id);

create policy "Users can delete their own notes" on public.instance_notes
  for delete using (auth.uid() = user_id);

-- Policies for STORIES
create policy "Users can view their own stories" on public.stories
  for select using (auth.uid() = user_id);

create policy "Users can insert their own stories" on public.stories
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own stories" on public.stories
  for update using (auth.uid() = user_id);

create policy "Users can delete their own stories" on public.stories
  for delete using (auth.uid() = user_id);
