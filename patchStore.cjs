const fs = require('fs');

const fileTarget = 'src/store/calendarStore.ts';
let code = fs.readFileSync(fileTarget, 'utf8');

const helperCode = `
export interface ScheduleBlock {
    day_index: number;
    start_minute: number;
    duration_minutes: number;
    label_id: string;
}

function generateUIState(config: CalendarConfig, rawBlocks: ScheduleBlock[], rawNotes: Record<string, string>) {
    const newSchedule: Record<string, string> = {};
    const newInstanceNotes: Record<string, string> = {};
    const startMins = config.startHour * 60 + config.startMinute;
    const step = config.stepMinutes;

    rawBlocks.forEach(block => {
        let currentMin = block.start_minute;
        const blockEnd = block.start_minute + block.duration_minutes;
        
        while (currentMin < blockEnd) {
            const slotIndex = Math.floor((currentMin - startMins) / step);
            const cellKey = \`\${block.day_index}-\${slotIndex}\`;
            
            newSchedule[cellKey] = block.label_id;
            
            const rawNoteKey = \`\${block.day_index}-\${block.start_minute}\`;
            if (rawNotes[rawNoteKey]) {
                newInstanceNotes[cellKey] = rawNotes[rawNoteKey];
            }
            
            currentMin += step;
        }
    });

    return { schedule: newSchedule, instanceNotes: newInstanceNotes };
}

function optimizeBlocks(blocks: ScheduleBlock[]) {
    return blocks;
}
`;

// Insert helpers before useCalendarStore
if (!code.includes('export interface ScheduleBlock')) {
    code = code.replace('export const useCalendarStore = create<CalendarState>()(', helperCode + '\nexport const useCalendarStore = create<CalendarState>()(');
}

// 2. Interfaces
code = code.replace(
    'schedule: Record<string, string>;\n    labels: CustomLabel[];\n    instanceNotes: Record<string, string>;',
    'schedule: Record<string, string>;\n    rawBlocks: ScheduleBlock[];\n    rawNotes: Record<string, string>;\n    labels: CustomLabel[];\n    instanceNotes: Record<string, string>;'
);

// 3. Initial state
code = code.replace(
    'schedule: {},\n            instanceNotes: {},',
    'schedule: {},\n            rawBlocks: [],\n            rawNotes: {},\n            instanceNotes: {},'
);

// 4. fetchData mapping
code = code.replace(
    `const newSchedule: Record<string, string> = {};
                    scheduleData?.forEach((entry: any) => {
                        newSchedule[\\\`\\\\\${entry.day_index}-\\\\\${entry.slot_index}\\\`] = entry.label_id;
                    });

                    // Map Instance Notes
                    const newInstanceNotes: Record<string, string> = {};
                    notesData?.forEach((note: any) => {
                        newInstanceNotes[note.key] = note.content;
                    });`.replace(/\\/g, ''),
    `const newRawBlocks: ScheduleBlock[] = scheduleData?.map((e: any) => ({
                        day_index: e.day_index,
                        start_minute: e.start_minute, 
                        duration_minutes: e.duration_minutes || 30,
                        label_id: e.label_id
                    })) || [];

                    const newRawNotes: Record<string, string> = {};
                    notesData?.forEach((note: any) => {
                        newRawNotes[note.key] = note.content;
                    });

                    const { schedule: newSchedule, instanceNotes: newInstanceNotes } = generateUIState(newConfig, newRawBlocks, newRawNotes);`
);

code = code.replace(
    `set({
                        config: newConfig,
                        labels: newLabels,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        stories: newStories,`,
    `set({
                        config: newConfig,
                        labels: newLabels,
                        rawBlocks: newRawBlocks,
                        rawNotes: newRawNotes,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        stories: newStories,`
);

// 5. setConfig Replacement
if (code.includes('// Migrate Schedule')) {
    const startIdx = code.indexOf('// Recalculate Offsets');
    // Ensure we capture the exact closing syntax by going to the next '},' that closes setConfig
    const endIdx = code.indexOf('},', code.indexOf('pendingOps: [...state.pendingOps, async () => {', startIdx)) + 2;

    const replacement = `const { schedule: newSchedule, instanceNotes: newInstanceNotes } = generateUIState(newConfig, state.rawBlocks, state.rawNotes);

                    return {
                        config: newConfig,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            const userId = (await supabase.auth.getUser()).data.user?.id;
                            if (userId) {
                                await supabase.from('calendar_config').upsert({
                                    user_id: userId,
                                    start_hour: newConfig.startHour,
                                    start_minute: newConfig.startMinute,
                                    end_hour: newConfig.endHour,
                                    end_minute: newConfig.endMinute,
                                    step_minutes: newConfig.stepMinutes
                                }, { onConflict: 'user_id' });
                            }
                        }]
                    };
                });
            },`;

    code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
}

// 6. Replace setCell, updateCell, setCellsBatch
const startBatchIdx = code.indexOf('setCell: async (dayIndex, slotIndex, labelId) => {');
const endBatchIdx = code.indexOf('clearSchedule:', startBatchIdx) - 13; // FIXED startBatchIdx

if (startBatchIdx !== -1 && endBatchIdx !== -1) {
    const newBatchMethods = `setCell: async (dayIndex, slotIndex, labelId) => {
                const { isLocked, schedule } = get();
                if (isLocked) return;
                const key = \`\${dayIndex}-\${slotIndex}\`;
                const current = schedule[key];
                const next = current === labelId ? null : labelId;
                get().setCellsBatch([{ day: dayIndex, slot: slotIndex }], next);
            },

            updateCell: async (dayIndex, slotIndex, labelId) => {
                const { isLocked } = get();
                if (isLocked) return;
                get().setCellsBatch([{ day: dayIndex, slot: slotIndex }], labelId || null);
            },

            setCellsBatch: async (cells, labelId) => {
                const { isLocked, config, rawBlocks, rawNotes } = get();
                if (isLocked) return;

                const startMins = config.startHour * 60 + config.startMinute;
                const step = config.stepMinutes;

                let newRawBlocks = [...rawBlocks];
                let newRawNotes = { ...rawNotes };

                cells.forEach(cell => {
                    const cellStart = startMins + (cell.slot * step);
                    const cellEnd = cellStart + step;

                    let slicedBlocks: ScheduleBlock[] = [];
                    newRawBlocks.forEach(b => {
                        if (b.day_index !== cell.day) {
                            slicedBlocks.push(b);
                            return;
                        }
                        const bStart = b.start_minute;
                        const bEnd = b.start_minute + b.duration_minutes;

                        if (bEnd <= cellStart || bStart >= cellEnd) {
                            slicedBlocks.push(b);
                        } else {
                            if (bStart < cellStart) {
                                slicedBlocks.push({ ...b, duration_minutes: cellStart - bStart });
                            }
                            if (bEnd > cellEnd) {
                                slicedBlocks.push({ ...b, start_minute: cellEnd, duration_minutes: bEnd - cellEnd });
                            }
                            const noteKey = \`\${b.day_index}-\${bStart}\`;
                            if (cellStart <= bStart && cellEnd >= bStart) {
                                delete newRawNotes[noteKey];
                            }
                        }
                    });
                    newRawBlocks = slicedBlocks;

                    if (labelId !== null) {
                        newRawBlocks.push({
                            day_index: cell.day,
                            start_minute: cellStart,
                            duration_minutes: step,
                            label_id: labelId
                        });
                    }
                });

                newRawBlocks = optimizeBlocks(newRawBlocks);
                const { schedule: newSchedule, instanceNotes: newInstanceNotes } = generateUIState(config, newRawBlocks, newRawNotes);

                set((state) => ({
                    rawBlocks: newRawBlocks,
                    rawNotes: newRawNotes,
                    schedule: newSchedule,
                    instanceNotes: newInstanceNotes,
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (!userId) return;

                        await supabase.from('schedule_entries').delete().eq('user_id', userId);
                        await supabase.from('instance_notes').delete().eq('user_id', userId);

                        const scheduleUpserts = newRawBlocks.map(b => ({
                            user_id: userId,
                            day_index: b.day_index,
                            start_minute: b.start_minute,
                            duration_minutes: b.duration_minutes,
                            label_id: b.label_id
                        }));
                        
                        if (scheduleUpserts.length > 0) {
                            await supabase.from('schedule_entries').insert(scheduleUpserts);
                        }

                        const notesUpserts = Object.keys(newRawNotes).map(key => ({
                            user_id: userId,
                            key: key,
                            content: newRawNotes[key]
                        }));
                        if (notesUpserts.length > 0) {
                            await supabase.from('instance_notes').insert(notesUpserts);
                        }
                    }]
                }));
            },

            `;
    code = code.substring(0, startBatchIdx) + newBatchMethods + code.substring(endBatchIdx);
}

// 7. removeLabel, clearSchedule, updateInstanceNote
code = code.replace(
    `const keysToRemove = Object.keys(state.schedule).filter(key => state.schedule[key] === id);
                    const newSchedule = { ...state.schedule };
                    const newInstanceNotes = { ...state.instanceNotes };
                    keysToRemove.forEach(key => {
                        delete newSchedule[key];
                        delete newInstanceNotes[key];
                    });

                    return {
                        labels: state.labels.filter(l => l.id !== id),
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,`,
    `const newRawBlocks = state.rawBlocks.filter(b => b.label_id !== id);
                    const { schedule: newSchedule, instanceNotes: newInstanceNotes } = generateUIState(state.config, newRawBlocks, state.rawNotes);

                    return {
                        labels: state.labels.filter(l => l.id !== id),
                        rawBlocks: newRawBlocks,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,`
);

code = code.replace(
    `schedule: {},
                    instanceNotes: {},
                    hasUnsavedChanges: true,`,
    `schedule: {},
                    instanceNotes: {},
                    rawBlocks: [],
                    rawNotes: {},
                    hasUnsavedChanges: true,`
);

const oldNotes = `updateInstanceNote: async (key, notes) => {
                set((state) => ({
                    instanceNotes: { ...state.instanceNotes, [key]: notes },
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (userId) {
                            if (notes.trim() === '') {
                                await supabase.from('instance_notes').delete().match({ key });
                            } else {
                                await supabase.from('instance_notes').upsert({
                                    user_id: userId,
                                    key,
                                    content: notes
                                });
                            }
                        }
                    }]
                }));
            },`;

const newNotes = `updateInstanceNote: async (key, notes) => {
                set((state) => {
                    const startMins = state.config.startHour * 60 + state.config.startMinute;
                    const step = state.config.stepMinutes;
                    const dashIndex = key.indexOf('-');
                    const dayIndex = parseInt(key.substring(0, dashIndex));
                    const slotIndex = parseInt(key.substring(dashIndex + 1));
                    
                    const absoluteMinute = startMins + (slotIndex * step);
                    const absoluteKey = \`\${dayIndex}-\${absoluteMinute}\`;

                    const newRawNotes = { ...state.rawNotes };
                    if (notes.trim() === '') {
                        delete newRawNotes[absoluteKey];
                    } else {
                        newRawNotes[absoluteKey] = notes;
                    }

                    const { instanceNotes: newInstanceNotes } = generateUIState(state.config, state.rawBlocks, newRawNotes);

                    return {
                        rawNotes: newRawNotes,
                        instanceNotes: newInstanceNotes,
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            const userId = (await supabase.auth.getUser()).data.user?.id;
                            if (userId) {
                                if (notes.trim() === '') {
                                    await supabase.from('instance_notes').delete().match({ key: absoluteKey });
                                } else {
                                    await supabase.from('instance_notes').upsert({
                                        user_id: userId,
                                        key: absoluteKey,
                                        content: notes
                                    }, { onConflict: 'user_id,key' });
                                }
                            }
                        }]
                    };
                });
            },`;

if (code.includes('updateInstanceNote: async (key, notes) => {')) {
    const startIdx = code.indexOf('updateInstanceNote: async (key, notes) => {');
    const endIdx = code.indexOf('},', code.indexOf('pendingOps: [...state.pendingOps', startIdx)) + 2;
    code = code.substring(0, startIdx) + newNotes + code.substring(endIdx);
}

fs.writeFileSync(fileTarget, code, 'utf8');
console.log('Successfully patched calendarStore.ts');
