-- 1. Remove the old unique constraint bounded to the flawed slot_index
ALTER TABLE public.schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_user_id_day_index_slot_index_key;

-- 2. Rename the arbitrary slot_index to a literal start_minute absolute tracker
ALTER TABLE public.schedule_entries RENAME COLUMN slot_index TO start_minute;

-- 3. Add a duration tracker so the blocks never shrink or expand when changing step sizes
ALTER TABLE public.schedule_entries ADD COLUMN duration_minutes integer DEFAULT 30 NOT NULL;

-- 4. Set the new unique constraint enforcing absolute time
ALTER TABLE public.schedule_entries ADD CONSTRAINT schedule_entries_user_id_day_index_start_minute_key UNIQUE (user_id, day_index, start_minute);
