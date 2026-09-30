DO $$ 
BEGIN
    -- 1. Eliminar la restricción antigua atada a la ranura (slot_index) si existe
    ALTER TABLE public.schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_user_id_day_index_slot_index_key;
    
    -- 2. Renombrar la columna vieja a nuestro nuevo medidor de minutos absolutos SOLO SI existe
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_entries' AND column_name='slot_index') THEN
        ALTER TABLE public.schedule_entries RENAME COLUMN slot_index TO start_minute;
    END IF;

    -- 3. Añadir el medidor de duración de las etiquetas SOLO SI NO existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule_entries' AND column_name='duration_minutes') THEN
        ALTER TABLE public.schedule_entries ADD COLUMN duration_minutes integer DEFAULT 30 NOT NULL;
    END IF;
    
    -- 4. Establecer la nueva restricción que impone la precisión sobre estos minutos
    ALTER TABLE public.schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_user_id_day_index_start_minute_key;
    ALTER TABLE public.schedule_entries ADD CONSTRAINT schedule_entries_user_id_day_index_start_minute_key UNIQUE (user_id, day_index, start_minute);

END $$;

-- ---------------------------------------------------------------------------
-- replace_schedule: atomic replacement of a user's schedule (and optionally notes).
-- The app calls this instead of DELETE + INSERT so a failed save can never leave
-- the schedule empty. Runs as the caller (RLS applies).
create or replace function public.replace_schedule(
  blocks jsonb,
  notes jsonb default null,
  delete_note_keys text[] default '{}'
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.schedule_entries where user_id = uid;
  insert into public.schedule_entries (user_id, day_index, start_minute, duration_minutes, label_id)
  select uid,
         (b->>'day_index')::int,
         (b->>'start_minute')::int,
         (b->>'duration_minutes')::int,
         b->>'label_id'
  from jsonb_array_elements(coalesce(blocks, '[]'::jsonb)) as b;

  if notes is not null then
    -- Full replace of the notes too (used when restoring a local draft).
    delete from public.instance_notes where user_id = uid;
    insert into public.instance_notes (user_id, key, content)
    select uid, n.key, n.value from jsonb_each_text(notes) as n;
  elsif coalesce(array_length(delete_note_keys, 1), 0) > 0 then
    delete from public.instance_notes where user_id = uid and key = any(delete_note_keys);
  end if;
end;
$$;

revoke all on function public.replace_schedule(jsonb, jsonb, text[]) from public;
grant execute on function public.replace_schedule(jsonb, jsonb, text[]) to authenticated;
