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
