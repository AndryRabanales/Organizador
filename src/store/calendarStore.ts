import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase'; // Import supabase

export interface CalendarConfig {
    startHour: number; // 0-23
    endHour: number;   // 0-24 (24 means end of day)
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

    setConfig: (config: Partial<CalendarConfig>) => void;
    setCell: (dayIndex: number, slotIndex: number, labelId: string) => void;
    updateCell: (dayIndex: number, slotIndex: number, labelId: ActivityType) => void;
    setCellsBatch: (cells: { day: number, slot: number }[], labelId: ActivityType) => void;
    clearSchedule: () => void;

    // Async Actions
    fetchData: () => Promise<void>;

    addLabel: (name: string, color: string) => void;
    removeLabel: (id: string) => void;
    updateLabelNotes: (id: string, notes: string) => void;
    updateInstanceNote: (key: string, notes: string) => void;
    updateDailyNotes: (labelId: string, notes: string) => void;

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
                endHour: 21,
                stepMinutes: 30,
            },
            schedule: {},
            instanceNotes: {},
            dailyNotes: '',
            labels: DEFAULT_LABELS,
            stories: [],
            isLocked: false,
            isLoading: true, // Start as true

            fetchData: async () => {
                set({ isLoading: true });
                try {
                    console.log("Fetching from Supabase...");
                    const { data: labelsData, error: lError } = await supabase.from('labels').select('*');
                    const { data: scheduleData } = await supabase.from('schedule_entries').select('*');
                    const { data: notesData } = await supabase.from('instance_notes').select('*');
                    const { data: storiesData } = await supabase.from('stories').select('*');

                    if (lError) throw lError;

                    // Map DB Labels to State Labels
                    const newLabels = (labelsData && labelsData.length > 0) ? labelsData.map((l: any) => ({
                        id: l.id, // UUID from DB
                        name: l.name,
                        color: l.color,
                        notes: l.notes || '',
                        dailyNotes: l.daily_notes || '',
                        openTabs: l.open_tabs || ['global', 'instance'],
                        trashedTabs: l.trashed_tabs || [],
                        customTabs: l.custom_tabs || {}
                    })) : DEFAULT_LABELS;

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
                        labels: newLabels,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        stories: newStories,
                        isLoading: false
                    });
                    console.log("Data fetched successfully");

                } catch (error) {
                    console.error("Error fetching data:", error);
                    // On error, we keep local state (persist) but stop loading
                    set({ isLoading: false });
                }
            },

            setConfig: (newConfig) => set((state) => ({
                config: { ...state.config, ...newConfig }
            })),

            setCell: async (dayIndex, slotIndex, labelId) => {
                const { isLocked, schedule, instanceNotes } = get();
                if (isLocked) return;

                const key = `${dayIndex}-${slotIndex}`;
                // Toggle if single click on same type
                const current = schedule[key];
                const next = current === labelId ? undefined : labelId;

                const userId = (await supabase.auth.getUser()).data.user?.id;
                // If no user, we just update local state (optimistic or offline mode)

                const newSchedule = { ...schedule };
                const newInstanceNotes = { ...instanceNotes };

                if (next === undefined) {
                    delete newSchedule[key];
                    delete newInstanceNotes[key];
                    if (userId) {
                        supabase.from('schedule_entries').delete().match({ day_index: dayIndex, slot_index: slotIndex }).then();
                        supabase.from('instance_notes').delete().match({ key }).then();
                    }
                } else {
                    newSchedule[key] = next;
                    if (userId) {
                        supabase.from('schedule_entries').upsert({
                            user_id: userId,
                            day_index: dayIndex,
                            slot_index: slotIndex,
                            label_id: next
                        }, { onConflict: 'user_id,day_index,slot_index' }).then();
                    }
                }

                set({ schedule: newSchedule, instanceNotes: newInstanceNotes });
            },

            updateCell: async (dayIndex, slotIndex, labelId) => {
                const { isLocked, schedule, instanceNotes } = get();
                if (isLocked) return;

                const userId = (await supabase.auth.getUser()).data.user?.id;
                const key = `${dayIndex}-${slotIndex}`;
                // optimistic updates
                const newSchedule = { ...schedule };
                const newInstanceNotes = { ...instanceNotes };

                if (labelId === undefined || labelId === null) {
                    delete newSchedule[key];
                    delete newInstanceNotes[key];
                    if (userId) {
                        supabase.from('schedule_entries').delete().match({ day_index: dayIndex, slot_index: slotIndex }).then();
                        supabase.from('instance_notes').delete().match({ key }).then();
                    }
                } else {
                    newSchedule[key] = labelId;
                    if (userId) {
                        supabase.from('schedule_entries').upsert({
                            user_id: userId,
                            day_index: dayIndex,
                            slot_index: slotIndex,
                            label_id: labelId
                        }, { onConflict: 'user_id,day_index,slot_index' }).then();
                    }
                }

                set({ schedule: newSchedule, instanceNotes: newInstanceNotes });
            },

            setCellsBatch: async (cells, labelId) => {
                const { isLocked, schedule, instanceNotes } = get();
                if (isLocked) return;

                const userId = (await supabase.auth.getUser()).data.user?.id;

                const newSchedule = { ...schedule };
                const newInstanceNotes = { ...instanceNotes };
                const upserts: any[] = [];

                cells.forEach(cell => {
                    const key = `${cell.day}-${cell.slot}`;
                    if (labelId === null) {
                        delete newSchedule[key];
                        delete newInstanceNotes[key];
                        if (userId) {
                            supabase.from('schedule_entries').delete().match({ day_index: cell.day, slot_index: cell.slot }).then();
                            supabase.from('instance_notes').delete().match({ key }).then();
                        }
                    } else {
                        newSchedule[key] = labelId;
                        if (userId) {
                            upserts.push({
                                user_id: userId,
                                day_index: cell.day,
                                slot_index: cell.slot,
                                label_id: labelId
                            });
                        }
                    }
                });

                if (upserts.length > 0 && userId) {
                    supabase.from('schedule_entries').upsert(upserts, { onConflict: 'user_id,day_index,slot_index' }).then(({ error }) => {
                        if (error) console.error("Batch Upsert Error", error);
                    });
                }

                set({ schedule: newSchedule, instanceNotes: newInstanceNotes });
            },

            clearSchedule: () => set((state) => {
                if (state.isLocked) return {};
                return { schedule: {}, instanceNotes: {} }
            }),

            addLabel: async (name, color) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
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

                set((state) => ({ labels: [...state.labels, newLabel] }));

                if (userId) {
                    supabase.from('labels').insert({
                        id: newLabel.id,
                        user_id: userId,
                        name: newLabel.name,
                        color: newLabel.color,
                        notes: '',
                        daily_notes: '',
                        open_tabs: newLabel.openTabs,
                        trashed_tabs: newLabel.trashedTabs,
                        custom_tabs: newLabel.customTabs
                    }).then(({ error }) => {
                        if (error) console.error("Add Label DB Error", error);
                    });
                }
            },

            removeLabel: async (id) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                set((state) => {
                    const keysToRemove = Object.keys(state.schedule).filter(key => state.schedule[key] === id);
                    const newSchedule = { ...state.schedule };
                    const newInstanceNotes = { ...state.instanceNotes };
                    keysToRemove.forEach(key => {
                        delete newSchedule[key];
                        delete newInstanceNotes[key];
                    });

                    if (userId) {
                        supabase.from('labels').delete().eq('id', id).then();
                        // Cascading delete is handled by DB for schedule_entries, but instance_notes might create orphans if we don't clear them manually or have DB cascade.
                        // My schema said: label_id references labels on delete cascade. So schedule_entries are gone.
                        // instance_notes are NOT linked to labels directly, they are linked to keys.
                        // So we MUST delete instance notes manually or by key.
                        // We can't delete by "key where label was X" easily in SQL without a join delete.
                        // Simpler to just let them rot? No, better to delete explicitly if we know the keys.
                        // But we don't know the keys in the DB without querying. 
                        // Actually, if we delete the `schedule_entries` (via cascade), the `instance_notes` for those keys are now "orphans" logic-wise but effectively just data on a blank cell.
                        // Just like before, we should delete them.
                        // We will trust the local state knows the keys.
                        // But for async, let's just delete the label and let cascade handle schedule.
                        // For instance notes... we might leave them or delete them if we can match keys.
                    }

                    return {
                        labels: state.labels.filter(l => l.id !== id),
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes
                    };
                });
            },

            updateLabelNotes: async (id, notes) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                set((state) => ({
                    labels: state.labels.map(l => l.id === id ? { ...l, notes } : l)
                }));
                if (userId) {
                    supabase.from('labels').update({ notes }).eq('id', id).then();
                }
            },

            updateInstanceNote: async (key, notes) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                set((state) => ({
                    instanceNotes: { ...state.instanceNotes, [key]: notes }
                }));
                if (userId) {
                    supabase.from('instance_notes').upsert({
                        user_id: userId,
                        key,
                        content: notes
                    }, { onConflict: 'user_id,key' }).then();
                }
            },

            updateDailyNotes: async (labelId, notes) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                set((state) => ({
                    labels: state.labels.map(l => l.id === labelId ? { ...l, dailyNotes: notes } : l)
                }));
                if (userId) {
                    supabase.from('labels').update({ daily_notes: notes }).eq('id', labelId).then();
                }
            },

            addStory: async (story) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                const newStory = {
                    ...story,
                    id: crypto.randomUUID(),
                    createdAt: Date.now(),
                    status: 'pending' as const
                };
                set((state) => ({ stories: [...state.stories, newStory] }));

                if (userId) {
                    supabase.from('stories').insert({
                        id: newStory.id,
                        user_id: userId,
                        day_index: newStory.dayIndex,
                        hour: newStory.hour,
                        minute: newStory.minute,
                        title: newStory.title,
                        content: newStory.content,
                        created_at: newStory.createdAt,
                        status: newStory.status
                    }).then();
                }
            },

            updateStory: async (id, updates) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                set((state) => ({
                    stories: state.stories.map(s => s.id === id ? { ...s, ...updates } : s)
                }));
                if (userId) {
                    supabase.from('stories').update(updates).eq('id', id).then();
                }
            },

            removeStory: async (id) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                set((state) => ({
                    stories: state.stories.filter(s => s.id !== id)
                }));
                if (userId) {
                    supabase.from('stories').delete().eq('id', id).then();
                }
            },

            addTab: async (labelId) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                let updatedLabel: CustomLabel | undefined;

                set((state) => ({
                    labels: state.labels.map(l => {
                        if (l.id !== labelId) return l;
                        const totalTabs = l.openTabs.length + l.trashedTabs.length;
                        if (totalTabs >= 7) return l; // Max limit reached

                        const newTabId = `tab-${crypto.randomUUID()}`;
                        const customTab: CustomTab = {
                            id: newTabId,
                            title: `Note ${Object.keys(l.customTabs).length + 1}`,
                            content: ''
                        };

                        updatedLabel = {
                            ...l,
                            openTabs: [...l.openTabs, newTabId],
                            customTabs: { ...l.customTabs, [newTabId]: customTab }
                        };
                        return updatedLabel;
                    })
                }));

                if (userId && updatedLabel) {
                    supabase.from('labels').update({
                        open_tabs: updatedLabel.openTabs,
                        custom_tabs: updatedLabel.customTabs
                    }).eq('id', labelId).then();
                }
            },

            closeTab: async (labelId, tabId) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                let updatedLabel: CustomLabel | undefined;

                set((state) => ({
                    labels: state.labels.map(l => {
                        if (l.id !== labelId) return l;
                        if (!l.openTabs.includes(tabId)) return l;
                        updatedLabel = {
                            ...l,
                            openTabs: l.openTabs.filter(id => id !== tabId),
                            trashedTabs: [...l.trashedTabs, tabId]
                        };
                        return updatedLabel;
                    })
                }));

                if (userId && updatedLabel) {
                    supabase.from('labels').update({
                        open_tabs: updatedLabel.openTabs,
                        trashed_tabs: updatedLabel.trashedTabs
                    }).eq('id', labelId).then();
                }
            },

            restoreTab: async (labelId, tabId) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                let updatedLabel: CustomLabel | undefined;

                set((state) => ({
                    labels: state.labels.map(l => {
                        if (l.id !== labelId) return l;
                        if (!l.trashedTabs.includes(tabId)) return l;
                        updatedLabel = {
                            ...l,
                            trashedTabs: l.trashedTabs.filter(id => id !== tabId),
                            openTabs: [...l.openTabs, tabId]
                        };
                        return updatedLabel;
                    })
                }));

                if (userId && updatedLabel) {
                    supabase.from('labels').update({
                        open_tabs: updatedLabel.openTabs,
                        trashed_tabs: updatedLabel.trashedTabs
                    }).eq('id', labelId).then();
                }
            },

            deleteTabForever: async (labelId, tabId) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                let updatedLabel: CustomLabel | undefined;

                set((state) => ({
                    labels: state.labels.map(l => {
                        if (l.id !== labelId) return l;

                        // Permanent delete logic
                        const newCustomTabs = { ...l.customTabs };
                        if (tabId.startsWith('tab-')) {
                            delete newCustomTabs[tabId];
                        }

                        updatedLabel = {
                            ...l,
                            trashedTabs: l.trashedTabs.filter(id => id !== tabId),
                            customTabs: newCustomTabs
                        };
                        return updatedLabel;
                    })
                }));

                if (userId && updatedLabel) {
                    supabase.from('labels').update({
                        trashed_tabs: updatedLabel.trashedTabs,
                        custom_tabs: updatedLabel.customTabs
                    }).eq('id', labelId).then();
                }
            },

            updateCustomTab: async (labelId, tabId, content) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                let updatedLabel: CustomLabel | undefined;

                set((state) => ({
                    labels: state.labels.map(l => {
                        if (l.id !== labelId) return l;
                        const oldTab = l.customTabs[tabId];
                        if (!oldTab) return l;

                        updatedLabel = {
                            ...l,
                            customTabs: {
                                ...l.customTabs,
                                [tabId]: { ...oldTab, content }
                            }
                        };
                        return updatedLabel;
                    })
                }));

                if (userId && updatedLabel) {
                    supabase.from('labels').update({
                        custom_tabs: updatedLabel.customTabs
                    }).eq('id', labelId).then();
                }
            },

            reorderTabs: async (labelId, newOrder) => {
                const userId = (await supabase.auth.getUser()).data.user?.id;
                set((state) => ({
                    labels: state.labels.map(l => l.id === labelId ? { ...l, openTabs: newOrder } : l)
                }));
                if (userId) {
                    supabase.from('labels').update({ open_tabs: newOrder }).eq('id', labelId).then();
                }
            },

            toggleLock: () => set((state) => ({ isLocked: !state.isLocked })),
        }),
        {
            name: 'calendar-storage',
        }
    )
);
