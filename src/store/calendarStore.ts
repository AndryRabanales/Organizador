import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

    setConfig: (config: Partial<CalendarConfig>) => void;
    setCell: (dayIndex: number, slotIndex: number, labelId: string) => void;
    updateCell: (dayIndex: number, slotIndex: number, labelId: ActivityType) => void;
    setCellsBatch: (cells: { day: number, slot: number }[], labelId: ActivityType) => void;
    clearSchedule: () => void;

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
        (set) => ({
            config: {
                startHour: 5,
                endHour: 21,
                stepMinutes: 30,
            },
            schedule: {},
            instanceNotes: {},
            dailyNotes: '',
            // dailyNotes removed from top level (Comment incorrect now, it is back)
            labels: DEFAULT_LABELS,
            stories: [],
            isLocked: false,

            setConfig: (newConfig) => set((state) => ({
                config: { ...state.config, ...newConfig }
            })),

            setCell: (dayIndex, slotIndex, labelId) => set((state) => {
                if (state.isLocked) return {};
                const key = `${dayIndex}-${slotIndex}`;
                // Toggle if single click on same type
                const current = state.schedule[key];
                const next = current === labelId ? undefined : labelId;

                const newSchedule = { ...state.schedule };
                const newInstanceNotes = { ...state.instanceNotes };
                
                if (next === undefined) {
                    delete newSchedule[key];
                    delete newInstanceNotes[key];
                } else {
                    newSchedule[key] = next;
                }

                return { schedule: newSchedule, instanceNotes: newInstanceNotes };
            }),

            updateCell: (dayIndex, slotIndex, labelId) => set((state) => {
                if (state.isLocked) return {};
                const key = `${dayIndex}-${slotIndex}`;
                const newSchedule = { ...state.schedule };
                const newInstanceNotes = { ...state.instanceNotes };

                if (labelId === undefined || labelId === null) {
                    delete newSchedule[key];
                    delete newInstanceNotes[key];
                } else {
                    newSchedule[key] = labelId;
                }

                return { schedule: newSchedule, instanceNotes: newInstanceNotes };
            }),

            setCellsBatch: (cells, labelId) => set((state) => {
                if (state.isLocked) return {};
                const newSchedule = { ...state.schedule };
                const newInstanceNotes = { ...state.instanceNotes };

                cells.forEach(cell => {
                    const key = `${cell.day}-${cell.slot}`;
                    if (labelId === null) {
                        delete newSchedule[key];
                        // Also delete the note if we are erasing the cell
                        delete newInstanceNotes[key];
                    } else {
                        newSchedule[key] = labelId;
                    }
                });
                return { schedule: newSchedule, instanceNotes: newInstanceNotes };
            }),

            clearSchedule: () => set((state) => {
                if (state.isLocked) return {};
                return { schedule: {}, instanceNotes: {} }
            }),

            addLabel: (name, color) => set((state) => ({
                labels: [...state.labels, {
                    id: crypto.randomUUID(),
                    name,
                    color,
                    notes: '',
                    dailyNotes: '',
                    openTabs: ['global', 'instance'],
                    trashedTabs: [],
                    customTabs: {}
                }]
            })),

            removeLabel: (id) => set((state) => {
                // Find all cells that use this label
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
                    instanceNotes: newInstanceNotes
                };
            }),

            updateLabelNotes: (id, notes) => set((state) => ({
                labels: state.labels.map(l => l.id === id ? { ...l, notes } : l)
            })),

            updateInstanceNote: (key, notes) => set((state) => ({
                instanceNotes: { ...state.instanceNotes, [key]: notes }
            })),

            updateDailyNotes: (labelId, notes) => set((state) => ({
                labels: state.labels.map(l => l.id === labelId ? { ...l, dailyNotes: notes } : l)
            })),

            addStory: (story) => set((state) => ({
                stories: [...state.stories, {
                    ...story,
                    id: crypto.randomUUID(),
                    createdAt: Date.now(),
                    status: 'pending'
                }]
            })),

            updateStory: (id, updates) => set((state) => ({
                stories: state.stories.map(s => s.id === id ? { ...s, ...updates } : s)
            })),

            removeStory: (id) => set((state) => ({
                stories: state.stories.filter(s => s.id !== id)
            })),

            addTab: (labelId) => set((state) => ({
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

                    return {
                        ...l,
                        openTabs: [...l.openTabs, newTabId],
                        customTabs: { ...l.customTabs, [newTabId]: customTab }
                    };
                })
            })),

            closeTab: (labelId, tabId) => set((state) => ({
                labels: state.labels.map(l => {
                    if (l.id !== labelId) return l;
                    if (!l.openTabs.includes(tabId)) return l;
                    return {
                        ...l,
                        openTabs: l.openTabs.filter(id => id !== tabId),
                        trashedTabs: [...l.trashedTabs, tabId]
                    };
                })
            })),

            restoreTab: (labelId, tabId) => set((state) => ({
                labels: state.labels.map(l => {
                    if (l.id !== labelId) return l;
                    if (!l.trashedTabs.includes(tabId)) return l;
                    return {
                        ...l,
                        trashedTabs: l.trashedTabs.filter(id => id !== tabId),
                        openTabs: [...l.openTabs, tabId]
                    };
                })
            })),

            deleteTabForever: (labelId, tabId) => set((state) => ({
                labels: state.labels.map(l => {
                    if (l.id !== labelId) return l;

                    // Permanent delete logic
                    const newCustomTabs = { ...l.customTabs };
                    if (tabId.startsWith('tab-')) {
                        delete newCustomTabs[tabId];
                    }

                    return {
                        ...l,
                        trashedTabs: l.trashedTabs.filter(id => id !== tabId),
                        customTabs: newCustomTabs
                    };
                })
            })),

            updateCustomTab: (labelId, tabId, content) => set((state) => ({
                labels: state.labels.map(l => {
                    if (l.id !== labelId) return l;
                    if (!l.customTabs[tabId]) return l;
                    return {
                        ...l,
                        customTabs: {
                            ...l.customTabs,
                            [tabId]: { ...l.customTabs[tabId], content }
                        }
                    };
                })
            })),

            reorderTabs: (labelId, newOrder) => set((state) => ({
                labels: state.labels.map(l => {
                    if (l.id !== labelId) return l;
                    return { ...l, openTabs: newOrder };
                })
            })),

            toggleLock: () => set((state) => ({ isLocked: !state.isLocked })),
        }),
        {
            name: 'calendar-storage',
        }
    )
);
