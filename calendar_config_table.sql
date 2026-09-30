-- 5. CALENDAR CONFIG TABLE
-- Stores user-specific settings like startHour, startMinute, endHour, endMinute, stepMinutes
create table if not exists public.calendar_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_hour integer default 5,
  start_minute integer not null default 0,
  end_hour integer default 21,
  end_minute integer not null default 0,
  step_minutes integer default 30,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Existing databases created before minute precision existed: add the missing columns.
alter table public.calendar_config add column if not exists start_minute integer not null default 0;
alter table public.calendar_config add column if not exists end_minute integer not null default 0;
alter table public.calendar_config add column if not exists updated_at timestamp with time zone not null default timezone('utc'::text, now());

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

-- 6. REALTIME
-- Other devices refresh automatically when any of these tables change (RLS still applies).
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['calendar_config', 'labels', 'schedule_entries', 'instance_notes', 'stories'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
