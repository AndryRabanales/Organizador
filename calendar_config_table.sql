-- 5. CALENDAR CONFIG TABLE
-- Stores user-specific settings like startHour, endHour, stepMinutes
create table if not exists public.calendar_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_hour integer default 5,
  end_hour integer default 21,
  step_minutes integer default 30,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for CALENDAR CONFIG
alter table public.calendar_config enable row level security;

create policy "Users can view their own config" on public.calendar_config
  for select using (auth.uid() = user_id);

create policy "Users can insert their own config" on public.calendar_config
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own config" on public.calendar_config
  for update using (auth.uid() = user_id);

create policy "Users can delete their own config" on public.calendar_config
  for delete using (auth.uid() = user_id);
