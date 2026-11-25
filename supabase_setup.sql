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
  start_minute integer not null, -- Absolute minute of the day (e.g., 360 for 6:00 AM)
  duration_minutes integer default 30 not null,
  label_id text references public.labels(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, day_index, start_minute) -- Unique constraint for upsert
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

-- 7. GOALS ("Metas" area: a goal / habit tracker)
-- One row per goal. label_id optionally reuses a schedule label (name and color follow the label).
create table if not exists public.goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  label_id text references public.labels(id) on delete set null,
  color text, -- own color for goals created from scratch
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists goals_user_id_idx on public.goals(user_id);

alter table public.goals enable row level security;

create policy "Users can view their own goals" on public.goals
  for select using ((select auth.uid()) = user_id);

create policy "Users can insert their own goals" on public.goals
  for insert with check ((select auth.uid()) = user_id);

create policy "Users can update their own goals" on public.goals
  for update using ((select auth.uid()) = user_id);

create policy "Users can delete their own goals" on public.goals
  for delete using ((select auth.uid()) = user_id);

-- 8. GOAL CHECKS (history: one row per goal per day it was done)
create table if not exists public.goal_checks (
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null, -- the user's local calendar day
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  primary key (goal_id, day)
);

create index if not exists goal_checks_user_day_idx on public.goal_checks(user_id, day);

alter table public.goal_checks enable row level security;

create policy "Users can view their own goal checks" on public.goal_checks
  for select using ((select auth.uid()) = user_id);

create policy "Users can insert their own goal checks" on public.goal_checks
  for insert with check ((select auth.uid()) = user_id);

create policy "Users can update their own goal checks" on public.goal_checks
  for update using ((select auth.uid()) = user_id);

create policy "Users can delete their own goal checks" on public.goal_checks
  for delete using ((select auth.uid()) = user_id);

-- Realtime: other devices refresh when goals or their marks change
alter publication supabase_realtime add table public.goals;
alter publication supabase_realtime add table public.goal_checks;
