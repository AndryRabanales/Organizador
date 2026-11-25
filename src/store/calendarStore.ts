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

/** A goal / habit tracked day by day in the "Metas" area. */
export interface Goal {
    id: string;
    name: string;
    /** Optional link to a schedule label: the goal then shows that label's current name and color. */
    labelId: string | null;
    /** Own color for goals created from scratch (null = app accent). */
    color: string | null;
    createdAt: string;
}

/** Key of one "goal done on day" mark inside goalChecks. */
export function goalCheckKey(goalId: string, dayKey: string): string {
    return `${goalId}|${dayKey}`;
}

/** First and last day (YYYY-MM-DD) of a month given as YYYY-MM. */
function monthRange(monthKey: string): { from: string; to: string } {
    const [y, m] = monthKey.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

/** Marks whose day falls outside [from, to] (the day is the last 10 characters of the key). */
function checksOutside(checks: Record<string, true>, from: string, to: string): Record<string, true> {
    const kept: Record<string, true> = {};
    Object.keys(checks).forEach(key => {
        const day = key.slice(-10);
        if (day < from || day > to) kept[key] = true;
    });
    return kept;
}

/** Local calendar day as YYYY-MM-DD (not UTC, so the checklist flips at the user's midnight). */
export function localDayKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

export interface ScheduleBlock {
    day_index: number;
    start_minute: number;
    duration_minutes: number;
    label_id: string;
}

/** Unsaved schedule-related edits, kept in localStorage so a reload / re-login does not lose them. */
export interface Draft {
    config: CalendarConfig;
    rawBlocks: ScheduleBlock[];
    rawNotes: Record<string, string>;
    savedAt: number;
}

interface CalendarState {
    config: CalendarConfig;
    // Key: "dayIndex-timeSlotIndex", Value: label ID
    schedule: Record<string, string>;
    rawBlocks: ScheduleBlock[];
    rawNotes: Record<string, string>;
    labels: CustomLabel[];
    instanceNotes: Record<string, string>; // "day-slot" -> note
    dailyNotes: string;
    stories: Story[];
    goals: Goal[];
    /** Done marks, keyed with goalCheckKey(goalId, day). Only the months in loadedGoalMonths are complete. */
    goalChecks: Record<string, true>;
    /** Months (YYYY-MM) whose marks have been fetched from the server. */
    loadedGoalMonths: string[];
    isLoading: boolean; // Loading state
    isSaving: boolean;
    hasUnsavedChanges: boolean;
    /** Message of the last failed sync (save or fetch). null when everything is in sync. */
    syncError: string | null;
    /** True when the last sync failed because the Supabase session is gone; the user must sign in again. */
    authExpired: boolean;
    /** Unsaved edits found in localStorage on load (from a previous session); the user decides to restore or discard. */
    pendingDraft: Draft | null;
    lastSyncedAt: number | null;

    // Internal queue for deferred DB operations
    pendingOps: (() => Promise<any>)[];

    setConfig: (config: Partial<CalendarConfig>) => void;
    setCell: (dayIndex: number, slotIndex: number, labelId: string) => void;
    updateCell: (dayIndex: number, slotIndex: number, labelId: ActivityType) => void;
    setCellsBatch: (cells: { day: number, slot: number }[], labelId: ActivityType) => void;
    clearSchedule: () => void;

    // Async Actions
    fetchData: (opts?: { silent?: boolean }) => Promise<void>;
    saveChanges: (silent?: boolean) => Promise<void>;
    discardChanges: () => void;
    /** Re-fetch from the server only when there is nothing pending locally (safe to call often). */
    refreshIfIdle: () => Promise<void>;
    /** Subscribe to realtime + visibility changes so other devices' edits show up here. Returns an unsubscribe fn. */
    startRealtimeSync: () => () => void;
    restoreDraft: () => void;
    discardDraft: () => void;
    /** Ends the dead session so the login screen appears; the draft in localStorage survives the redirect. */
    signOutForReauth: () => Promise<void>;

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

    // Goal Actions
    addGoal: (name: string, opts?: { labelId?: string; color?: string }) => void;
    updateGoal: (id: string, updates: { name?: string; color?: string }) => void;
    /** Deletes the goal together with all of its history. */
    removeGoal: (id: string) => void;
    /** Marks the goal as done on the given local day, or removes the mark if it is already there. */
    toggleGoalCheck: (id: string, dayKey: string) => void;
    /** Fetches the marks of a month (YYYY-MM) that has not been loaded yet. */
    loadGoalChecksForMonth: (monthKey: string) => Promise<void>;

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



/** Throws when a Supabase response carries an error, so a failed write can never be mistaken for a saved one. */
function must<T extends { error: unknown }>(res: T): T {
    if (res.error) throw res.error;
    return res;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
    return String(error);
}

export class SessionExpiredError extends Error {
    constructor() {
        super('SESSION_EXPIRED');
        this.name = 'SessionExpiredError';
    }
}

/**
 * Resolves the current user's id, refreshing the token when it is about to expire.
 * Throws SessionExpiredError instead of returning undefined so a write can never be skipped silently.
 */
async function requireUserId(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    const expiresSoon = !!session?.expires_at && session.expires_at * 1000 < Date.now() + 30_000;
    if (session && !expiresSoon) return session.user.id;

    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) throw new SessionExpiredError();
    return data.session.user.id;
}

// ---- Draft persistence (unsaved edits survive reloads and OAuth redirects) ----
const DRAFT_KEY = 'calendar-draft';

function writeDraft(draft: Omit<Draft, 'savedAt'>) {
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
    } catch { /* storage unavailable: nothing to do */ }
}

function readDraft(): Draft | null {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<Draft>;
        if (!parsed.config || !Array.isArray(parsed.rawBlocks) || !parsed.rawNotes) return null;
        return parsed as Draft;
    } catch {
        return null;
    }
}

function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function sortedNotes(notes: Record<string, string>) {
    return Object.keys(notes).sort().map(k => [k, notes[k]]);
}

/** True when the draft holds exactly what the server already has (nothing to restore). */
function draftMatches(draft: Draft, config: CalendarConfig, blocks: ScheduleBlock[], notes: Record<string, string>) {
    return JSON.stringify(draft.config) === JSON.stringify(config)
        && JSON.stringify(optimizeBlocks(draft.rawBlocks)) === JSON.stringify(blocks)
        && JSON.stringify(sortedNotes(draft.rawNotes)) === JSON.stringify(sortedNotes(notes));
}

function toRpcBlocks(blocks: ScheduleBlock[]) {
    return blocks.map(b => ({
        day_index: b.day_index,
        start_minute: b.start_minute,
        duration_minutes: b.duration_minutes,
        label_id: b.label_id
    }));
}

/** Tables whose changes on another device must refresh this one. */
const SYNCED_TABLES = ['calendar_config', 'labels', 'schedule_entries', 'instance_notes', 'stories', 'goals', 'goal_checks'] as const;

/** Done marks between two days (inclusive), read in pages because PostgREST caps a response at 1000 rows. */
async function fetchGoalChecks(fromDay: string, toDay: string): Promise<Record<string, true>> {
    const PAGE = 1000;
    const checks: Record<string, true> = {};
    for (let offset = 0; ; offset += PAGE) {
        const { data } = must(await supabase.from('goal_checks')
            .select('goal_id, day')
            .gte('day', fromDay)
            .lte('day', toDay)
            .order('day', { ascending: true })
            .order('goal_id', { ascending: true })
            .range(offset, offset + PAGE - 1));
        (data ?? []).forEach(row => { checks[goalCheckKey(row.goal_id, row.day)] = true; });
        if (!data || data.length < PAGE) break;
    }
    return checks;
}

function generateUIState(config: CalendarConfig, rawBlocks: ScheduleBlock[], rawNotes: Record<string, string>) {
    const newSchedule: Record<string, string> = {};
    const newInstanceNotes: Record<string, string> = {};
    const startMins = config.startHour * 60 + config.startMinute;
    const step = config.stepMinutes;

    rawBlocks.forEach(block => {
        if (block.duration_minutes <= 0) return;
        const bStart = block.start_minute;
        const bEnd = block.start_minute + block.duration_minutes;

        // Calculate exact slot overlap
        const minSlot = Math.floor((bStart - startMins) / step);
        const maxSlot = Math.floor((bEnd - 1 - startMins) / step);

        for (let s = minSlot; s <= maxSlot; s++) {
            const cellKey = `${block.day_index}-${s}`;
            newSchedule[cellKey] = block.label_id;
        }
    });

    // Copy all rawNotes directly into instanceNotes.
    // Note cleanup (when a block is deleted) is handled in setCellsBatch, not here.
    Object.keys(rawNotes).forEach(rawNoteKey => {
        if (rawNoteKey.indexOf('-') !== -1) {
            newInstanceNotes[rawNoteKey] = rawNotes[rawNoteKey];
        }
    });

    return { schedule: newSchedule, instanceNotes: newInstanceNotes };
}

function optimizeBlocks(blocks: ScheduleBlock[]) {
    // Sort blocks sequentially
    const sorted = [...blocks].sort((a, b) => {
        if (a.day_index !== b.day_index) return a.day_index - b.day_index;
        return a.start_minute - b.start_minute;
    });

    const merged: ScheduleBlock[] = [];
    sorted.forEach(b => {
        if (b.duration_minutes <= 0) return;
        if (merged.length === 0) {
            merged.push({ ...b });
            return;
        }
        const last = merged[merged.length - 1];
        // Merge seamlessly contiguous blocks of the same type to keep DB neat
        if (last.day_index === b.day_index &&
            last.label_id === b.label_id &&
            last.start_minute + last.duration_minutes === b.start_minute) {
            last.duration_minutes += b.duration_minutes;
        } else {
            merged.push({ ...b });
        }
    });

    return merged;
}

// Declared before the store: persist() calls partialize synchronously while hydrating.
let lastConfirmedSnapshot: Pick<CalendarState, 'config' | 'schedule' | 'rawBlocks' | 'labels' | 'rawNotes' | 'instanceNotes' | 'stories' | 'goals' | 'goalChecks' | 'isLocked' | 'dailyNotes'> | null = null;

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
            rawBlocks: [],
            rawNotes: {},
            instanceNotes: {},
            dailyNotes: '',
            labels: DEFAULT_LABELS,
            stories: [],
            goals: [],
            goalChecks: {},
            loadedGoalMonths: [],
            isLocked: true, // Default to true (Viewing Mode)
            isLoading: true, // Start as true
            isSaving: false,
            hasUnsavedChanges: false,
            syncError: null,
            authExpired: false,
            pendingDraft: null,
            lastSyncedAt: null,
            pendingOps: [],

            fetchData: async (opts = {}) => {
                const silent = !!opts.silent;
                if (silent) {
                    const { hasUnsavedChanges, pendingOps, isSaving } = get();
                    // Never overwrite edits that have not reached the server yet.
                    if (hasUnsavedChanges || pendingOps.length > 0 || isSaving) return;
                } else {
                    set({ isLoading: true });
                }
                try {
                    console.log(silent ? "Refreshing from Supabase..." : "Fetching from Supabase...");
                    // Detect a dead session up front (shows the sign-in banner instead of a generic error).
                    await requireUserId();
                    const { data: configData } = must(await supabase.from('calendar_config').select('*').maybeSingle());
                    const { data: labelsData, error: lError } = must(await supabase.from('labels').select('*'));
                    const { data: scheduleData } = must(await supabase.from('schedule_entries').select('*'));
                    const { data: notesData } = must(await supabase.from('instance_notes').select('*'));
                    const { data: storiesData } = must(await supabase.from('stories').select('*'));
                    const { data: goalsData } = must(await supabase.from('goals').select('*').order('created_at', { ascending: true }));

                    // Goal marks: this month and the previous one up front; older months load when opened.
                    const today = new Date();
                    const currentMonth = localDayKey(today).slice(0, 7);
                    const previousMonth = localDayKey(new Date(today.getFullYear(), today.getMonth() - 1, 1)).slice(0, 7);
                    const recentFrom = monthRange(previousMonth).from;
                    const recentTo = monthRange(currentMonth).to;
                    const recentChecks = await fetchGoalChecks(recentFrom, recentTo);

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
                        const userId = await requireUserId();
                        if (userId) {
                            // Seed defaults (errors are logged, never silently dropped)
                            must(await supabase.from('labels').insert(DEFAULT_LABELS.map(l => ({
                                id: l.id,
                                user_id: userId,
                                name: l.name,
                                color: l.color,
                                notes: '',
                                daily_notes: '',
                                open_tabs: l.openTabs,
                                trashed_tabs: l.trashedTabs,
                                custom_tabs: l.customTabs
                            }))));
                        }
                    }

                    // Map Raw Blocks
                    const newRawBlocks: ScheduleBlock[] = scheduleData?.map((entry: any) => ({
                        day_index: entry.day_index,
                        start_minute: entry.start_minute, // Assuming backend now stores absolute start_minute!
                        duration_minutes: entry.duration_minutes,
                        label_id: entry.label_id
                    })) || [];

                    // Optimize blocks on load
                    const optimizedBlocks = optimizeBlocks(newRawBlocks);

                    // Map Raw Notes
                    const newRawNotes: Record<string, string> = {};
                    notesData?.forEach((note: any) => {
                        newRawNotes[note.key] = note.content;
                    });

                    // Derive Schedule and InstanceNotes
                    const { schedule: newSchedule, instanceNotes: newInstanceNotes } = generateUIState(newConfig, optimizedBlocks, newRawNotes);

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

                    if (silent && (get().hasUnsavedChanges || get().pendingOps.length > 0 || get().isSaving)) {
                        // The user started editing while the request was in flight; keep their edits.
                        return;
                    }

                    // Unsaved edits from a previous session (reload, expired session, OAuth redirect)?
                    let pendingDraft: Draft | null = null;
                    if (!silent) {
                        const draft = readDraft();
                        if (draft) {
                            if (draftMatches(draft, newConfig, optimizedBlocks, newRawNotes)) clearDraft();
                            else pendingDraft = draft;
                        }
                    }

                    set((state) => ({
                        config: newConfig,
                        labels: newLabels,
                        rawBlocks: optimizedBlocks,
                        rawNotes: newRawNotes,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        stories: newStories,
                        goals: (goalsData ?? []).map((g): Goal => ({
                            id: g.id,
                            name: g.name,
                            labelId: g.label_id ?? null,
                            color: g.color ?? null,
                            createdAt: g.created_at
                        })),
                        // A silent refresh keeps older months on screen (they re-load when viewed); a full load starts clean.
                        goalChecks: silent
                            ? { ...checksOutside(state.goalChecks, recentFrom, recentTo), ...recentChecks }
                            : recentChecks,
                        loadedGoalMonths: [previousMonth, currentMonth],
                        isLoading: false,
                        isLocked: silent ? state.isLocked : true, // Force viewing mode on a full load only
                        hasUnsavedChanges: false,
                        pendingOps: [],
                        syncError: null,
                        authExpired: false,
                        pendingDraft: silent ? state.pendingDraft : pendingDraft,
                        lastSyncedAt: Date.now()
                    }));
                    console.log(silent ? "Data refreshed" : "Data fetched successfully");

                } catch (error) {
                    console.error("Error fetching data:", error);
                    set({ isLoading: false, syncError: errorMessage(error), authExpired: error instanceof SessionExpiredError });
                }
            },

            restoreDraft: () => {
                const draft = get().pendingDraft;
                if (!draft) return;
                const blocks = optimizeBlocks(draft.rawBlocks);
                const notes = { ...draft.rawNotes };
                const config = { ...draft.config };
                const { schedule, instanceNotes } = generateUIState(config, blocks, notes);

                set((state) => ({
                    config,
                    rawBlocks: blocks,
                    rawNotes: notes,
                    schedule,
                    instanceNotes,
                    pendingDraft: null,
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = await requireUserId();
                        must(await supabase.from('calendar_config').upsert({
                            user_id: userId,
                            start_hour: config.startHour,
                            start_minute: config.startMinute,
                            end_hour: config.endHour,
                            end_minute: config.endMinute,
                            step_minutes: config.stepMinutes,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id' }));
                        // Full atomic replace of blocks + notes with what the draft holds.
                        must(await supabase.rpc('replace_schedule', { blocks: toRpcBlocks(blocks), notes }));
                    }]
                }));
            },

            discardDraft: () => {
                clearDraft();
                set({ pendingDraft: null });
            },

            signOutForReauth: async () => {
                // The draft is already in localStorage; App.tsx shows the login screen when the session ends.
                await supabase.auth.signOut();
            },

            refreshIfIdle: async () => {
                await get().fetchData({ silent: true });
            },

            startRealtimeSync: () => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                const scheduleRefresh = () => {
                    if (timer) clearTimeout(timer);
                    // Debounce: a save touches several tables in a row.
                    timer = setTimeout(() => { timer = null; void get().refreshIfIdle(); }, 800);
                };

                const channel = supabase.channel('calendar-sync');
                SYNCED_TABLES.forEach((table) => {
                    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
                });
                channel.subscribe((status) => {
                    // On (re)connect, catch up on anything missed while the socket was down.
                    if (status === 'SUBSCRIBED') scheduleRefresh();
                });

                // Phones suspend background tabs: refresh whenever the app comes back to the foreground.
                const onVisible = () => {
                    if (document.visibilityState === 'visible') scheduleRefresh();
                };
                document.addEventListener('visibilitychange', onVisible);
                window.addEventListener('focus', onVisible);
                window.addEventListener('online', scheduleRefresh);

                return () => {
                    if (timer) clearTimeout(timer);
                    document.removeEventListener('visibilitychange', onVisible);
                    window.removeEventListener('focus', onVisible);
                    window.removeEventListener('online', scheduleRefresh);
                    void supabase.removeChannel(channel);
                };
            },

            saveChanges: async (silent = false) => {
                const { pendingOps, isSaving } = get();
                if (pendingOps.length === 0 || isSaving) return;

                // Snapshot: ops queued while this save is running stay in the queue for the next one.
                const opsToRun = pendingOps;
                set({ isSaving: true, syncError: null, ...(silent ? {} : { isLoading: true }) });

                let completed = 0;
                try {
                    for (const op of opsToRun) {
                        await op();
                        completed++;
                    }
                    set((state) => {
                        const remaining = state.pendingOps.filter(op => !opsToRun.includes(op));
                        return {
                            pendingOps: remaining,
                            hasUnsavedChanges: remaining.length > 0,
                            isSaving: false,
                            isLoading: false,
                            lastSyncedAt: Date.now()
                        };
                    });
                    if (get().pendingOps.length > 0) {
                        // Flush anything that was queued while we were saving.
                        void get().saveChanges(true);
                    } else {
                        // Everything the server confirmed; the local draft is no longer needed.
                        clearDraft();
                    }
                } catch (error) {
                    const message = errorMessage(error);
                    const expired = error instanceof SessionExpiredError;
                    console.error("Error saving changes:", error);
                    const done = opsToRun.slice(0, completed);
                    set((state) => ({
                        // Drop the ops that succeeded; keep the failed one and everything after it for retry.
                        pendingOps: state.pendingOps.filter(op => !done.includes(op)),
                        hasUnsavedChanges: true,
                        isSaving: false,
                        isLoading: false,
                        syncError: message,
                        authExpired: expired
                    }));
                    if (!silent && !expired) alert(`Error saving changes: ${message}`);
                }
            },

            discardChanges: () => {
                clearDraft();
                set({ pendingOps: [], hasUnsavedChanges: false, syncError: null });
                // Re-fetch data from DB, which overwrites local state
                void get().fetchData();
            },

            setConfig: async (newConfigParams) => {
                set((state) => {
                    const oldConfig = state.config;
                    const newConfig = { ...oldConfig, ...newConfigParams };

                    const { schedule: newSchedule, instanceNotes: newInstanceNotes } = generateUIState(newConfig, state.rawBlocks, state.rawNotes);

                    return {
                        config: newConfig,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            const userId = await requireUserId();
                            if (userId) {
                                must(await supabase.from('calendar_config').upsert({
                                    user_id: userId,
                                    start_hour: newConfig.startHour,
                                    start_minute: newConfig.startMinute,
                                    end_hour: newConfig.endHour,
                                    end_minute: newConfig.endMinute,
                                    step_minutes: newConfig.stepMinutes,
                                    updated_at: new Date().toISOString()
                                }, { onConflict: 'user_id' }));
                            }
                        }]
                    };
                });
            },

            setCell: async (dayIndex, slotIndex, labelId) => {
                const { isLocked, schedule } = get();
                if (isLocked) return;
                const key = `${dayIndex}-${slotIndex}`;
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
                const deletedNoteKeys: string[] = []; // Track exactly which note keys are removed

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
                            // Delete any note that falls inside the overwritten/deleted cell
                            Object.keys(newRawNotes).forEach(rawNoteKey => {
                                const dashIdx = rawNoteKey.indexOf('-');
                                const nDay = parseInt(rawNoteKey.substring(0, dashIdx));
                                const nMin = parseInt(rawNoteKey.substring(dashIdx + 1));
                                if (nDay === cell.day && nMin >= cellStart && nMin < cellEnd) {
                                    deletedNoteKeys.push(rawNoteKey);
                                    delete newRawNotes[rawNoteKey];
                                }
                            });
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

                // Snapshot deletedNoteKeys for the async closure
                const keysToDelete = [...deletedNoteKeys];
                const blocksSnapshot = newRawBlocks;

                set((state) => ({
                    rawBlocks: newRawBlocks,
                    rawNotes: newRawNotes,
                    schedule: newSchedule,
                    instanceNotes: newInstanceNotes,
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        await requireUserId();
                        // Single transaction on the server (replace_schedule): the old rows are only gone
                        // once the new ones are in, so a failure can never leave the schedule empty.
                        must(await supabase.rpc('replace_schedule', {
                            blocks: toRpcBlocks(blocksSnapshot),
                            delete_note_keys: keysToDelete
                        }));
                    }]
                }));
            },


            clearSchedule: () => set((state) => {
                if (state.isLocked) return {};
                return {
                    schedule: {},
                    instanceNotes: {},
                    rawBlocks: [],
                    rawNotes: {},
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        await requireUserId();
                        must(await supabase.rpc('replace_schedule', { blocks: [], notes: {} }));
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
                        const userId = await requireUserId();
                        if (userId) {
                            must(await supabase.from('labels').insert({
                                id: newLabel.id,
                                user_id: userId,
                                name: newLabel.name,
                                color: newLabel.color,
                                notes: '',
                                daily_notes: '',
                                open_tabs: newLabel.openTabs,
                                trashed_tabs: newLabel.trashedTabs,
                                custom_tabs: newLabel.customTabs
                            }));
                        }
                    }]
                }));
            },

            removeLabel: async (id) => {
                set((state) => {
                    const removedBlocks = state.rawBlocks.filter(b => b.label_id === id);
                    const newRawBlocks = state.rawBlocks.filter(b => b.label_id !== id);

                    // Notes that lived inside the removed blocks go away with them.
                    const newRawNotes = { ...state.rawNotes };
                    const noteKeysToDelete: string[] = [];
                    Object.keys(newRawNotes).forEach(rawNoteKey => {
                        const dashIdx = rawNoteKey.indexOf('-');
                        const nDay = parseInt(rawNoteKey.substring(0, dashIdx));
                        const nMin = parseInt(rawNoteKey.substring(dashIdx + 1));
                        const inside = removedBlocks.some(b =>
                            b.day_index === nDay && nMin >= b.start_minute && nMin < b.start_minute + b.duration_minutes
                        );
                        if (inside) {
                            noteKeysToDelete.push(rawNoteKey);
                            delete newRawNotes[rawNoteKey];
                        }
                    });

                    const { schedule: newSchedule, instanceNotes: newInstanceNotes } = generateUIState(state.config, newRawBlocks, newRawNotes);

                    return {
                        labels: state.labels.filter(l => l.id !== id),
                        rawBlocks: newRawBlocks,
                        rawNotes: newRawNotes,
                        schedule: newSchedule,
                        instanceNotes: newInstanceNotes,
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            const userId = await requireUserId();
                            if (!userId) return;
                            // schedule_entries cascade on label delete; notes are keyed by time so remove them explicitly.
                            must(await supabase.from('labels').delete().eq('id', id));
                            for (const key of noteKeysToDelete) {
                                must(await supabase.from('instance_notes').delete().match({ user_id: userId, key }));
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
                        must(await supabase.from('labels').update({ notes }).eq('id', id));
                    }]
                }));
            },

            updateLabel: async (id, updates) => {
                set((state) => ({
                    labels: state.labels.map(l => l.id === id ? { ...l, ...updates } : l),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        must(await supabase.from('labels').update(updates).eq('id', id));
                    }]
                }));
            },

            updateInstanceNote: async (key, notes) => {
                set((state) => {
                    const newRawNotes = { ...state.rawNotes };
                    if (!notes || notes.replace(/<[^>]*>/g, '').trim() === '') {
                        delete newRawNotes[key];
                    } else {
                        newRawNotes[key] = notes;
                    }
                    const { instanceNotes: newInstanceNotes } = generateUIState(state.config, state.rawBlocks, newRawNotes);

                    return {
                        rawNotes: newRawNotes,
                        instanceNotes: newInstanceNotes,
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            const userId = await requireUserId();
                            if (!userId) return;

                            const isBlank = !notes || notes.replace(/<[^>]*>/g, '').trim() === '';
                            if (isBlank) {
                                must(await supabase.from('instance_notes')
                                    .delete()
                                    .match({ user_id: userId, key }));
                            } else {
                                must(await supabase.from('instance_notes')
                                    .upsert({ user_id: userId, key, content: notes }, { onConflict: 'user_id,key' }));
                            }
                        }]
                    };
                });
            },

            updateDailyNotes: async (labelId, notes) => {
                set((state) => ({
                    labels: state.labels.map(l => l.id === labelId ? { ...l, dailyNotes: notes } : l),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        must(await supabase.from('labels').update({ daily_notes: notes }).eq('id', labelId));
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
                        const userId = await requireUserId();
                        if (userId) {
                            must(await supabase.from('stories').insert({
                                id: newStory.id,
                                user_id: userId,
                                day_index: newStory.dayIndex,
                                hour: newStory.hour,
                                minute: newStory.minute,
                                title: newStory.title,
                                content: newStory.content,
                                created_at: newStory.createdAt,
                                status: newStory.status
                            }));
                        }
                    }]
                }));
            },

            updateStory: async (id, updates) => {
                set((state) => ({
                    stories: state.stories.map(s => s.id === id ? { ...s, ...updates } : s),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        must(await supabase.from('stories').update(updates).eq('id', id));
                    }]
                }));
            },

            removeStory: async (id) => {
                set((state) => ({
                    stories: state.stories.filter(s => s.id !== id),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        must(await supabase.from('stories').delete().eq('id', id));
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
                            must(await supabase.from('labels').update({
                                open_tabs: updatedLabel.openTabs,
                                custom_tabs: updatedLabel.customTabs
                            }).eq('id', labelId));
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
                            must(await supabase.from('labels').update({
                                open_tabs: updatedLabel.openTabs,
                                trashed_tabs: updatedLabel.trashedTabs
                            }).eq('id', labelId));
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
                            must(await supabase.from('labels').update({
                                open_tabs: updatedLabel.openTabs,
                                trashed_tabs: updatedLabel.trashedTabs
                            }).eq('id', labelId));
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
                            must(await supabase.from('labels').update({
                                trashed_tabs: updatedLabel.trashedTabs,
                                custom_tabs: updatedLabel.customTabs
                            }).eq('id', labelId));
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
                            must(await supabase.from('labels').update({
                                custom_tabs: updatedLabel.customTabs
                            }).eq('id', labelId));
                        }]
                    }
                });
            },

            reorderTabs: async (labelId, newOrder) => {
                set((state) => ({
                    labels: state.labels.map(l => l.id === labelId ? { ...l, openTabs: newOrder } : l),
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        must(await supabase.from('labels').update({ open_tabs: newOrder }).eq('id', labelId));
                    }]
                }));
            },

            addGoal: (name, opts = {}) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                const newGoal: Goal = {
                    id: crypto.randomUUID(),
                    name: trimmed,
                    labelId: opts.labelId ?? null,
                    color: opts.color ?? null,
                    createdAt: new Date().toISOString()
                };
                set((state) => ({
                    goals: [...state.goals, newGoal],
                    hasUnsavedChanges: true,
                    pendingOps: [...state.pendingOps, async () => {
                        const userId = await requireUserId();
                        must(await supabase.from('goals').insert({
                            id: newGoal.id,
                            user_id: userId,
                            name: newGoal.name,
                            label_id: newGoal.labelId,
                            color: newGoal.color,
                            created_at: newGoal.createdAt
                        }));
                    }]
                }));
            },

            updateGoal: (id, updates) => {
                const clean: { name?: string; color?: string } = {};
                if (updates.name !== undefined && updates.name.trim()) clean.name = updates.name.trim();
                if (updates.color !== undefined) clean.color = updates.color;
                if (Object.keys(clean).length === 0) return;
                set((state) => {
                    if (!state.goals.some(g => g.id === id)) return {};
                    return {
                        goals: state.goals.map(g => g.id === id ? { ...g, ...clean } : g),
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            await requireUserId();
                            must(await supabase.from('goals').update(clean).eq('id', id));
                        }]
                    };
                });
            },

            removeGoal: (id) => {
                set((state) => {
                    const prefix = `${id}|`;
                    const goalChecks: Record<string, true> = {};
                    Object.keys(state.goalChecks).forEach(key => {
                        if (!key.startsWith(prefix)) goalChecks[key] = true;
                    });
                    return {
                        goals: state.goals.filter(g => g.id !== id),
                        goalChecks,
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            await requireUserId();
                            // goal_checks rows go with it (on delete cascade)
                            must(await supabase.from('goals').delete().eq('id', id));
                        }]
                    };
                });
            },

            toggleGoalCheck: (id, dayKey) => {
                set((state) => {
                    if (!state.goals.some(g => g.id === id)) return {};
                    const key = goalCheckKey(id, dayKey);
                    const goalChecks = { ...state.goalChecks };
                    const checked = !goalChecks[key];
                    if (checked) goalChecks[key] = true;
                    else delete goalChecks[key];
                    return {
                        goalChecks,
                        hasUnsavedChanges: true,
                        pendingOps: [...state.pendingOps, async () => {
                            const userId = await requireUserId();
                            if (checked) {
                                must(await supabase.from('goal_checks').upsert(
                                    { goal_id: id, user_id: userId, day: dayKey },
                                    { onConflict: 'goal_id,day', ignoreDuplicates: true }
                                ));
                            } else {
                                must(await supabase.from('goal_checks').delete().match({ goal_id: id, day: dayKey }));
                            }
                        }]
                    };
                });
            },

            loadGoalChecksForMonth: async (monthKey) => {
                if (get().loadedGoalMonths.includes(monthKey)) return;
                try {
                    await requireUserId();
                    const { from, to } = monthRange(monthKey);
                    const fetched = await fetchGoalChecks(from, to);
                    set((state) => state.loadedGoalMonths.includes(monthKey) ? {} : {
                        goalChecks: { ...checksOutside(state.goalChecks, from, to), ...fetched },
                        loadedGoalMonths: [...state.loadedGoalMonths, monthKey]
                    });
                } catch (error) {
                    console.error("Error loading goal history:", error);
                    set({ syncError: errorMessage(error), authExpired: error instanceof SessionExpiredError });
                }
            },

            toggleLock: () => set((state) => ({ isLocked: !state.isLocked })),
        }),
        {
            name: 'calendar-storage',
            // Only what the server confirmed reaches localStorage. While edits are pending, the previous
            // confirmed snapshot is kept, so a reload can never show "saved" data the server never got.
            // (Pending edits themselves live in the separate draft, see writeDraft.)
            partialize: (state) => {
                const confirmed = !state.hasUnsavedChanges && state.pendingOps.length === 0 && !state.isSaving;
                if (confirmed || !lastConfirmedSnapshot) {
                    lastConfirmedSnapshot = {
                        config: state.config,
                        schedule: state.schedule,
                        rawBlocks: state.rawBlocks,
                        labels: state.labels,
                        rawNotes: state.rawNotes,
                        instanceNotes: state.instanceNotes,
                        stories: state.stories,
                        goals: state.goals,
                        goalChecks: state.goalChecks,
                        isLocked: state.isLocked,
                        dailyNotes: state.dailyNotes
                    };
                }
                return lastConfirmedSnapshot;
            }
        }
    )
);

// Keep the draft in sync with every unsaved schedule/config/note edit.
useCalendarStore.subscribe((state, prev) => {
    if (!state.hasUnsavedChanges) return;
    if (state.rawBlocks === prev.rawBlocks && state.rawNotes === prev.rawNotes && state.config === prev.config) return;
    writeDraft({ config: state.config, rawBlocks: state.rawBlocks, rawNotes: state.rawNotes });
});
