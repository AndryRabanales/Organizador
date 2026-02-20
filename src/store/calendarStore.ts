import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase'; // Import supabase

export interface CalendarConfig {
    startHour: number; // 0-23
    startMinute: number; // 0-59
    endHour: number;   // 0-24 (24 means end of day)
    endMinute: number; // 0-59
    stepMinutes: number; // e.g. 15, 20, 30, 60
}

export interface CustomTab {
    id: string;
    title: string;
    content: string;
}

export interface CustomLabel {
    id: string; // 'work', 'rest', or custom UUID
    name: string;
    color: string; // hex or tailwind classish
    notes?: string; // Global content
    dailyNotes?: string; // Daily content (per label)

    // Modern Tab System
    openTabs: string[]; // IDs of visible tabs (including 'global', 'instance', 'daily')
    trashedTabs: string[]; // IDs of closed tabs
    customTabs: Record<string, CustomTab>; // Data for custom tabs
}

export interface Story {
    id: string;
    dayIndex: number; // 0-6 (Mon-Sun)
    hour: number;     // 0-23
    minute: number;   // 0-59
    title: string;
    content: string;
    createdAt: number;
    status: 'pending' | 'triggered' | 'viewed';
}

// Ensure unique IDs
export const DEFAULT_LABELS: CustomLabel[] = [
    {
        id: 'trabajo', name: 'Trabajo', color: '#10B981', notes: '', dailyNotes: '',
        openTabs: ['global', 'instance'],
        trashedTabs: [],
        customTabs: {}
    },
    {
        id: 'escuela', name: 'Escuela', color: '#3B82F6', notes: '', dailyNotes: '',
        openTabs: ['global', 'instance'],
        trashedTabs: [],
        customTabs: {}
    },
    {
        id: 'compras', name: 'Compras', color: '#F59E0B', notes: '', dailyNotes: '',
        openTabs: ['global', 'instance'],
        trashedTabs: [],
        customTabs: {}
    },
];

export type ActivityType = string | null;

interface CalendarState {
    config: CalendarConfig;
    // Key: "dayIndex-timeSlotIndex", Value: label ID
    schedule: Record<string, string>;
    labels: CustomLabel[];
    instanceNotes: Record<string, string>; // "day-slot" -> note
    dailyNotes: string;
    stories: Story[];
    isLoading: boolean; // Loading state
    hasUnsavedChanges: boolean;

    // Internal queue for deferred DB operations
    pendingOps: (() => Promise<any>)[];

    setConfig: (config: Partial<CalendarConfig>) => void;
    setCell: (dayIndex: number, slotIndex: number, labelId: string) => void;
    updateCell: (dayIndex: number, slotIndex: number, labelId: ActivityType) => void;
    setCellsBatch: (cells: { day: number, slot: number }[], labelId: ActivityType) => void;
    clearSchedule: () => void;

    // Async Actions
    fetchData: () => Promise<void>;
    saveChanges: (silent?: boolean) => Promise<void>;
    discardChanges: () => void;

    addLabel: (name: string, color: string) => void;
    removeLabel: (id: string) => void;
    updateLabelNotes: (id: string, notes: string) => void;
    updateInstanceNote: (key: string, notes: string) => void;
    updateDailyNotes: (labelId: string, notes: string) => void;
    updateLabel: (id: string, updates: { name?: string, color?: string }) => void;

    // Story Actions
    addStory: (story: Omit<Story, 'id' | 'createdAt' | 'status'>) => void;
    updateStory: (id: string, updates: Partial<Story>) => void;
    removeStory: (id: string) => void;

    // Tab Actions
    addTab: (labelId: string) => void;
    closeTab: (labelId: string, tabId: string) => void;
    restoreTab: (labelId: string, tabId: string) => void;
    deleteTabForever: (labelId: string, tabId: string) => void; // Used for permanent delete
    updateCustomTab: (labelId: string, tabId: string, content: string) => void;
    reorderTabs: (labelId: string, newOrder: string[]) => void;

    toggleLock: () => void;
    isLocked: boolean;
}

export const useCalendarStore = create<CalendarState>()(
    persist(
        (set, get) => ({
            config: {
                startHour: 5,
                startMinute: 0,
                endHour: 21,
                endMinute: 0,
                stepMinutes: 30,
            },
            schedule: {},
            instanceNotes: {},
            dailyNotes: '',
            labels: DEFAULT_LABELS,
            stories: [],
            isLocked: true, // Default to true (Viewing Mode)
            isLoading: true, // Start as true
            hasUnsavedChanges: false,
            pendingOps: [],

            fetchData: async () => {
                set({ isLoading: true });
                try {
                    console.log("Fetching from Supabase...");
                    const { data: configData } = await supabase.from('calendar_config').select('*').maybeSingle();
                    const { data: labelsData, error: lError } = await supabase.from('labels').select('*');
                    const { data: scheduleData } = await supabase.from('schedule_entries').select('*');
                    const { data: notesData } = await supabase.from('instance_notes').select('*');
                    const { data: storiesData } = await supabase.from('stories').select('*');

                    if (lError) throw lError;

                    // Map Config
                    let newConfig = get().config;
                    if (configData) {
                        newConfig = {
                            startHour: configData.start_hour,
                            startMinute: configData.start_minute || 0,
                            endHour: configData.end_hour,
                            endMinute: configData.end_minute || 0,
                            stepMinutes: configData.step_minutes
                        };
                    }

                    // Map DB Labels to State Labels
                    const newLabels = (labelsData && labelsData.length > 0) ? labelsData.map((l: any) => ({
                        id: l.id,
                        name: l.name,
                        color: l.color,
                        notes: l.notes || '',
                        dailyNotes: l.daily_notes || '',
                        openTabs: l.open_tabs || ['global', 'instance'],
                        trashedTabs: l.trashed_tabs || [],
                        customTabs: l.custom_tabs || {}
                    })) : DEFAULT_LABELS;

                    // If we have default labels but no DB labels, seed them!
                    // Check if this is a fresh user (no labels in DB)
                    if ((!labelsData || labelsData.length === 0) && newLabels === DEFAULT_LABELS) {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (userId) {
                            // Seed defaults async
                            DEFAULT_LABELS.forEach(l => {
                                supabase.from('labels').insert({
                                    id: l.id,
                                    user_id: userId,
                                    name: l.name,
                                    color: l.color,
                                    notes: '',
                                    daily_notes: '',
                                    open_tabs: l.openTabs,
                                    trashed_tabs: l.trashedTabs,
                                    custom_tabs: l.customTabs
                                }).then();
                            });
                        }
                    }

                    // Map Schedule
                    const newSchedule: Record<string, string> = {};
                    scheduleData?.forEach((entry: any) => {
                        newSchedule[`${entry.day_index}-${entry.slot_index}`] = entry.label_id;
                    });

                    // Map Instance Notes
                    const newInstanceNotes: Record<string, string> = {};
                    notesData?.forEach((note: any) => {
                        newInstanceNotes[note.key] = note.content;
                    });

                    // Map Stories
                    const newStories: Story[] = storiesData?.map((s: any) => ({
                        id: s.id,
                        dayIndex: s.day_index,
                        hour: s.hour,
                        minute: s.minute,
                        title: s.title,
                        content: s.content,
                        createdAt: Number(s.created_at || Date.now()),
                        status: s.status as any
                    })) || [];

                    set({
                        config: newConfig,
                        labels: newLabels,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        stories: newStories,
                        isLoading: false,
                        isLocked: true, // Force viewing mode on load
                        hasUnsavedChanges: false,
                        pendingOps: []
                    });
                    console.log("Data fetched successfully");

                } catch (error) {
                    console.error("Error fetching data:", error);
                    set({ isLoading: false });
                }
            },

            saveChanges: async (silent = false) => {
                const { pendingOps } = get();
                if (pendingOps.length === 0) return;

                if (!silent) set({ isLoading: true });
                try {
                    // Execute all pending operations sequentially
                    for (const op of pendingOps) {
                        await op();
                    }
                    set({
                        hasUnsavedChanges: false,
                        pendingOps: [],
                        isLoading: false
                    });
                } catch (error) {
                    console.error("Error saving changes:", error);
                    if (!silent) alert("Error saving changes. See console.");
                    set({ isLoading: false });
                }
            },

            discardChanges: () => {
                const { fetchData } = get();
                // Just re-fetch data from DB, which overwrites local state
                fetchData();
            },

            setConfig: async (newConfigParams) => {
                set((state) => {
                    const oldConfig = state.config;
                    const newConfig = { ...oldConfig, ...newConfigParams };

                    // Recalculate Offsets
                    const newSchedule: Record<string, string> = {};
                    const newInstanceNotes: Record<string, string> = {};

                    const oldStartMins = oldConfig.startHour * 60 + oldConfig.startMinute;
                    const oldStep = oldConfig.stepMinutes;

                    const newStartMins = newConfig.startHour * 60 + newConfig.startMinute;
                    const newStep = newConfig.stepMinutes;

                    // Migrate Schedule
                    Object.keys(state.schedule).forEach(key => {
                        const dashIndex = key.indexOf('-');
                        const dayStr = key.substring(0, dashIndex);
                        const slotStr = key.substring(dashIndex + 1);

                        const dayIndex = parseInt(dayStr);
                        const oldSlotIndex = parseInt(slotStr);

                        const startAbsoluteMins = oldStartMins + (oldSlotIndex * oldStep);
                        const endAbsoluteMins = startAbsoluteMins + oldStep;

                        // To preserve absolute time AND handle duration subdividing (e.g. 30min -> two 15min blocks),
                        // we must iterate across the block's physical duration by the new step size.
                        let currentMins = startAbsoluteMins;

                        // We loop using < instead of <= because if a block ends at 7:30, it shouldn't spill into the 7:30 slot itself.
                        while (currentMins < endAbsoluteMins) {
                            const newSlotIndex = Math.floor((currentMins - newStartMins) / newStep);
                            const newKey = `${dayIndex}-${newSlotIndex}`;

                            // Map the primary schedule label
                            newSchedule[newKey] = state.schedule[key];

                            // Map associated instance notes to all sub-divisions
                            if (state.instanceNotes[key]) {
                                newInstanceNotes[newKey] = state.instanceNotes[key];
                            }

                            currentMins += newStep;
                        }
                    });

                    // Any instance notes without a schedule block but within bounds could technically be migrated too,
                    // but practically, notes are tied to blocks. The logic above handles notes tied to migrating blocks.

                    return {
                        config: newConfig,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            const userId = (await supabase.auth.getUser()).data.user?.id;
                            if (userId) {
                                // 1. Save Config
                                await supabase.from('calendar_config').upsert({
                                    user_id: userId,
                                    start_hour: newConfig.startHour,
                                    start_minute: newConfig.startMinute,
                                    end_hour: newConfig.endHour,
                                    end_minute: newConfig.endMinute,
                                    step_minutes: newConfig.stepMinutes
                                }, { onConflict: 'user_id' });

                                // 2. Perform Mass Cleanup and Mass Insert for Schedule & Notes
                                // Delete all current schedule entries and notes
                                await supabase.from('schedule_entries').delete().eq('user_id', userId);
                                await supabase.from('instance_notes').delete().eq('user_id', userId);

                                // Bulk Insert new Schedule
                                const scheduleUpserts = Object.keys(newSchedule).map(key => {
                                    const dashIndex = key.indexOf('-');
                                    const dayIndex = parseInt(key.substring(0, dashIndex));
                                    const slotIndex = parseInt(key.substring(dashIndex + 1));

                                    return {
                                        user_id: userId,
                                        day_index: dayIndex,
                                        slot_index: slotIndex,
                                        label_id: newSchedule[key]
                                    };
                                });

                                if (scheduleUpserts.length > 0) {
                                    await supabase.from('schedule_entries').upsert(scheduleUpserts);
                                }

                                // Bulk Insert new Notes
                                const noteUpserts = Object.keys(newInstanceNotes).map(key => {
                                    return {
                                        user_id: userId,
                                        key: key,
                                        content: newInstanceNotes[key]
                                    };
                                });

                                if (noteUpserts.length > 0) {
                                    await supabase.from('instance_notes').upsert(noteUpserts);
                                }
                            }
                        }]
                    };
                });
            },

            setCell: async (dayIndex, slotIndex, labelId) => {
                const { isLocked, schedule, instanceNotes } = get();
                if (isLocked) return;

                const key = `${dayIndex}-${slotIndex}`;
                // Toggle if single click on same type
                const current = schedule[key];
                const next = current === labelId ? undefined : labelId;

                const newSchedule = { ...schedule };
                const newInstanceNotes = { ...instanceNotes };

                if (next === undefined) {
                    delete newSchedule[key];
                    delete newInstanceNotes[key];
                } else {
                    newSchedule[key] = next;
                }

                set((state) => ({
                    schedule: newSchedule,
                    instanceNotes: newInstanceNotes,
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (!userId) return;

                        if (next === undefined) {
                            await supabase.from('schedule_entries').delete().match({ day_index: dayIndex, slot_index: slotIndex });
                            await supabase.from('instance_notes').delete().match({ key });
                        } else {
                            await supabase.from('schedule_entries').upsert({
                                user_id: userId,
                                day_index: dayIndex,
                                slot_index: slotIndex,
                                label_id: next
                            }, { onConflict: 'user_id,day_index,slot_index' });
                        }
                    }]
                }));
            },

            updateCell: async (dayIndex, slotIndex, labelId) => {
                const { isLocked, schedule, instanceNotes } = get();
                if (isLocked) return;

                const key = `${dayIndex}-${slotIndex}`;
                const newSchedule = { ...schedule };
                const newInstanceNotes = { ...instanceNotes };

                if (labelId === undefined || labelId === null) {
                    delete newSchedule[key];
                    delete newInstanceNotes[key];
                } else {
                    newSchedule[key] = labelId;
                }

                set((state) => ({
                    schedule: newSchedule,
                    instanceNotes: newInstanceNotes,
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (!userId) return;

                        if (labelId === undefined || labelId === null) {
                            await supabase.from('schedule_entries').delete().match({ day_index: dayIndex, slot_index: slotIndex });
                            await supabase.from('instance_notes').delete().match({ key });
                        } else {
                            await supabase.from('schedule_entries').upsert({
                                user_id: userId,
                                day_index: dayIndex,
                                slot_index: slotIndex,
                                label_id: labelId
                            }, { onConflict: 'user_id,day_index,slot_index' });
                        }
                    }]
                }));
            },

            setCellsBatch: async (cells, labelId) => {
                const { isLocked, schedule, instanceNotes } = get();
                if (isLocked) return;

                const newSchedule = { ...schedule };
                const newInstanceNotes = { ...instanceNotes };

                cells.forEach(cell => {
                    const key = `${cell.day}-${cell.slot}`;
                    if (labelId === null) {
                        delete newSchedule[key];
                        delete newInstanceNotes[key];
                    } else {
                        newSchedule[key] = labelId;
                    }
                });

                set((state) => ({
                    schedule: newSchedule,
                    instanceNotes: newInstanceNotes,
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (!userId) return;

                        const upserts: any[] = [];
                        if (labelId === null) {
                            for (const cell of cells) {
                                await supabase.from('schedule_entries').delete().match({ day_index: cell.day, slot_index: cell.slot });
                                await supabase.from('instance_notes').delete().match({ key: `${cell.day}-${cell.slot}` });
                            }
                        } else {
                            cells.forEach(cell => {
                                upserts.push({
                                    user_id: userId,
                                    day_index: cell.day,
                                    slot_index: cell.slot,
                                    label_id: labelId
                                });
                            });
                            if (upserts.length > 0) {
                                await supabase.from('schedule_entries').upsert(upserts, { onConflict: 'user_id,day_index,slot_index' });
                            }
                        }
                    }]
                }));
            },

            clearSchedule: () => set((state) => {
                if (state.isLocked) return {};
                return {
                    schedule: {},
                    instanceNotes: {},
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (userId) {
                            await supabase.from('schedule_entries').delete().eq('user_id', userId);
                            await supabase.from('instance_notes').delete().eq('user_id', userId);
                        }
                    }]
                }
            }),

            addLabel: async (name, color) => {
                const newLabel: CustomLabel = {
                    id: crypto.randomUUID(),
                    name,
                    color,
                    notes: '',
                    dailyNotes: '',
                    openTabs: ['global', 'instance'],
                    trashedTabs: [],
                    customTabs: {}
                };

                set((state) => ({
                    labels: [...state.labels, newLabel],
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (userId) {
                            await supabase.from('labels').insert({
                                id: newLabel.id,
                                user_id: userId,
                                name: newLabel.name,
                                color: newLabel.color,
                                notes: '',
                                daily_notes: '',
                                open_tabs: newLabel.openTabs,
                                trashed_tabs: newLabel.trashedTabs,
                                custom_tabs: newLabel.customTabs
                            });
                        }
                    }]
                }));
            },

            removeLabel: async (id) => {
                set((state) => {
                    const keysToRemove = Object.keys(state.schedule).filter(key => state.schedule[key] === id);
                    const newSchedule = { ...state.schedule };
                    const newInstanceNotes = { ...state.instanceNotes };
                    keysToRemove.forEach(key => {
                        delete newSchedule[key];
                        delete newInstanceNotes[key];
                    });

                    return {
                        labels: state.labels.filter(l => l.id !== id),
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            const userId = (await supabase.auth.getUser()).data.user?.id;
                            if (userId) {
                                await supabase.from('labels').delete().eq('id', id);
                            }
                        }]
                    };
                });
            },

            updateLabelNotes: async (id, notes) => {
                set((state) => ({
                    labels: state.labels.map(l => l.id === id ? { ...l, notes } : l),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        await supabase.from('labels').update({ notes }).eq('id', id);
                    }]
                }));
            },

            updateLabel: async (id, updates) => {
                set((state) => ({
                    labels: state.labels.map(l => l.id === id ? { ...l, ...updates } : l),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        await supabase.from('labels').update(updates).eq('id', id);
                    }]
                }));
            },

            updateInstanceNote: async (key, notes) => {
                set((state) => ({
                    instanceNotes: { ...state.instanceNotes, [key]: notes },
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (userId) {
                            await supabase.from('instance_notes').upsert({
                                user_id: userId,
                                key,
                                content: notes
                            }, { onConflict: 'user_id,key' });
                        }
                    }]
                }));
            },

            updateDailyNotes: async (labelId, notes) => {
                set((state) => ({
                    labels: state.labels.map(l => l.id === labelId ? { ...l, dailyNotes: notes } : l),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        await supabase.from('labels').update({ daily_notes: notes }).eq('id', labelId);
                    }]
                }));
            },

            addStory: async (story) => {
                const newStory = {
                    ...story,
                    id: crypto.randomUUID(),
                    createdAt: Date.now(),
                    status: 'pending' as const
                };
                set((state) => ({
                    stories: [...state.stories, newStory],
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = (await supabase.auth.getUser()).data.user?.id;
                        if (userId) {
                            await supabase.from('stories').insert({
                                id: newStory.id,
                                user_id: userId,
                                day_index: newStory.dayIndex,
                                hour: newStory.hour,
                                minute: newStory.minute,
                                title: newStory.title,
                                content: newStory.content,
                                created_at: newStory.createdAt,
                                status: newStory.status
                            });
                        }
                    }]
                }));
            },

            updateStory: async (id, updates) => {
                set((state) => ({
                    stories: state.stories.map(s => s.id === id ? { ...s, ...updates } : s),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        await supabase.from('stories').update(updates).eq('id', id);
                    }]
                }));
            },

            removeStory: async (id) => {
                set((state) => ({
                    stories: state.stories.filter(s => s.id !== id),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        await supabase.from('stories').delete().eq('id', id);
                    }]
                }));
            },

            addTab: async (labelId) => {
                set((state) => {
                    const label = state.labels.find(l => l.id === labelId);
                    if (!label) return {};
                    const totalTabs = label.openTabs.length + label.trashedTabs.length;
                    if (totalTabs >= 7) return {};

                    const newTabId = `tab-${crypto.randomUUID()}`;
                    const customTab: CustomTab = {
                        id: newTabId,
                        title: `Note ${Object.keys(label.customTabs).length + 1}`,
                        content: ''
                    };

                    const updatedLabel = {
                        ...label,
                        openTabs: [...label.openTabs, newTabId],
                        customTabs: { ...label.customTabs, [newTabId]: customTab }
                    };

                    return {
                        labels: state.labels.map(l => l.id === labelId ? updatedLabel : l),
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            await supabase.from('labels').update({
                                open_tabs: updatedLabel.openTabs,
                                custom_tabs: updatedLabel.customTabs
                            }).eq('id', labelId);
                        }]
                    };
                });
            },

            closeTab: async (labelId, tabId) => {
                set((state) => {
                    const label = state.labels.find(l => l.id === labelId);
                    if (!label || !label.openTabs.includes(tabId)) return {};

                    const updatedLabel = {
                        ...label,
                        openTabs: label.openTabs.filter(id => id !== tabId),
                        trashedTabs: [...label.trashedTabs, tabId]
                    };

                    return {
                        labels: state.labels.map(l => l.id === labelId ? updatedLabel : l),
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            await supabase.from('labels').update({
                                open_tabs: updatedLabel.openTabs,
                                trashed_tabs: updatedLabel.trashedTabs
                            }).eq('id', labelId);
                        }]
                    };
                });
            },

            restoreTab: async (labelId, tabId) => {
                set((state) => {
                    const label = state.labels.find(l => l.id === labelId);
                    if (!label || !label.trashedTabs.includes(tabId)) return {};

                    const updatedLabel = {
                        ...label,
                        trashedTabs: label.trashedTabs.filter(id => id !== tabId),
                        openTabs: [...label.openTabs, tabId]
                    };

                    return {
                        labels: state.labels.map(l => l.id === labelId ? updatedLabel : l),
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            await supabase.from('labels').update({
                                open_tabs: updatedLabel.openTabs,
                                trashed_tabs: updatedLabel.trashedTabs
                            }).eq('id', labelId);
                        }]
                    };
                });
            },

            deleteTabForever: async (labelId, tabId) => {
                set((state) => {
                    const label = state.labels.find(l => l.id === labelId);
                    if (!label) return {};

                    const newCustomTabs = { ...label.customTabs };
                    if (tabId.startsWith('tab-')) {
                        delete newCustomTabs[tabId];
                    }

                    const updatedLabel = {
                        ...label,
                        trashedTabs: label.trashedTabs.filter(id => id !== tabId),
                        customTabs: newCustomTabs
                    };

                    return {
                        labels: state.labels.map(l => l.id === labelId ? updatedLabel : l),
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            await supabase.from('labels').update({
                                trashed_tabs: updatedLabel.trashedTabs,
                                custom_tabs: updatedLabel.customTabs
                            }).eq('id', labelId);
                        }]
                    };
                });
            },

            updateCustomTab: async (labelId, tabId, content) => {
                set((state) => {
                    const label = state.labels.find(l => l.id === labelId);
                    if (!label) return {};
                    const oldTab = label.customTabs[tabId];
                    if (!oldTab) return {};

                    const updatedLabel = {
                        ...label,
                        customTabs: {
                            ...label.customTabs,
                            [tabId]: { ...oldTab, content }
                        }
                    };

                    return {
                        labels: state.labels.map(l => l.id === labelId ? updatedLabel : l),
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            await supabase.from('labels').update({
                                custom_tabs: updatedLabel.customTabs
                            }).eq('id', labelId);
                        }]
                    }
                });
            },

            reorderTabs: async (labelId, newOrder) => {
                set((state) => ({
                    labels: state.labels.map(l => l.id === labelId ? { ...l, openTabs: newOrder } : l),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        await supabase.from('labels').update({ open_tabs: newOrder }).eq('id', labelId);
                    }]
                }));
            },

            toggleLock: () => set((state) => ({ isLocked: !state.isLocked })),
        }),
        {
            name: 'calendar-storage',
            partialize: (state) => ({
                config: state.config,
                schedule: state.schedule,
                labels: state.labels,
                instanceNotes: state.instanceNotes,
                stories: state.stories,
                isLocked: state.isLocked,
                dailyNotes: state.dailyNotes
                // Exclude pendingOps and hasUnsavedChanges
            })
        }
    )
);
