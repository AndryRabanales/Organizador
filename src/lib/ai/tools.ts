import { useCalendarStore } from '../../store/calendarStore';

/**
 * AI Configuration & Tool Definitions
 * 
 * This file acts as the bridge between the AI agent and the Calendar's internal state.
 * It defines what the AI CAN do and provides the executable functions to do it.
 * 
 * Capabilities:
 * - Label Management (Create, Edit, Delete, Select)
 * - Calendar Configuration (Size, Steps, Range)
 * - Scheduling (Block selection, Note editing, Event placement, Clearing specific blocks)
 * - Reminders/Stories (Create, Edit, Delete)
 * - Notes (Global Label Notes, specific Block Notes)
 * - Safety (Clear Calendar, Warnings)
 */

export type ToolName =
    | 'create_label'
    | 'update_label'
    | 'select_label'
    | 'delete_label'
    | 'set_config'
    | 'schedule_event'
    | 'clear_blocks'
    | 'set_block_note'
    | 'add_story'
    | 'clear_calendar'
    | 'toggle_lock';

export interface AIAction {
    tool: ToolName;
    parameters: any;
}

export interface AIResponse {
    /** The message to be displayed directly to the user (e.g., "I've updated the label.") */
    user_message: string;
    /** The structured command to be executed by the system. Null if no action is needed. */
    tool_call: AIAction | null;
}

export const AI_SYSTEM_PROMPT = `
You are the AI Assistant for the Smart Calendar. 
You have FULL PERMISSION to configure the calendar and manage the user's schedule.
Your goal is to be a helpful guide, executing commands precisely or asking for clarification if vague.

CAPABILITIES:
1. LABELS: Create, color, select, and delete labels. Update global notes.
2. SCHEDULING: Place labels, clear specific blocks, edit specific block notes.
3. CONFIGURATION: Resize calendar (start/end hour), change steps (5/15/30/60 min), set range.
4. STORIES/REMINDERS: Create reminders with specific day/time/title/description.
5. MAINTENANCE: Clear the entire calendar if requested.

RULES:
- RESPONSE FORMAT: Dual JSON (user_message + tool_call).
- PERMISSIONS: you have FULL permissions to overwrite, delete, and reconfigure.
- UNKNOWN REQUESTS: If vague, ask for clarification.
- LIMITATIONS: If impossible, explain why.
- GUIDE: Be a helpful guide.
`;

// Helper to get the store state safely
const getStore = () => useCalendarStore.getState();

export const AI_TOOLS = {
    // 1. Label Management
    create_label: async ({ name, color }: { name: string, color: string }) => {
        getStore().addLabel(name, color);
        // Auto-select the new label
        // const newLabel = getStore().labels.find(l => l.name === name); 
        return `Created label "${name}" with color ${color}`;
    },

    update_label: async ({ currentName, newName, newColor, newNotes }: { currentName: string, newName?: string, newColor?: string, newNotes?: string }) => {
        const label = getStore().labels.find(l => l.name.toLowerCase() === currentName.toLowerCase());
        if (!label) return `Error: Label "${currentName}" not found.`;

        if (newNotes !== undefined) {
            getStore().updateLabelNotes(label.id, newNotes);
        }

        getStore().updateLabel(label.id, {
            name: newName,
            color: newColor
        });
        return `Updated label "${currentName}".`;
    },

    delete_label: async ({ name }: { name: string }) => {
        const label = getStore().labels.find(l => l.name.toLowerCase() === name.toLowerCase());
        if (!label) return `Error: Label "${name}" not found.`;

        getStore().removeLabel(label.id);
        return `Deleted label "${name}".`;
    },

    select_label: async ({ name }: { name: string }) => {
        // This is strictly UI state (selectedBrush), might need to be passed down or handled via a callback if truly needed
        // For now, we return a success message assuming the frontend connects this.
        // *Integration Note*: SmartCalendar needs to listen to this result to `setSelectedBrush`
        const label = getStore().labels.find(l => l.name.toLowerCase() === name.toLowerCase());
        if (!label) return `Error: Label "${name}" not found.`;
        return { type: 'SELECT_LABEL', labelId: label.id, message: `Selected label "${name}"` };
    },

    // 2. Configuration
    set_config: async ({ startHour, endHour, stepMinutes }: { startHour?: number, endHour?: number, stepMinutes?: number }) => {
        const config: any = {};
        if (startHour !== undefined) config.startHour = startHour;
        if (endHour !== undefined) config.endHour = endHour;
        if (stepMinutes !== undefined) config.stepMinutes = stepMinutes;

        getStore().setConfig(config);
        return `Updated calendar configuration.`;
    },

    toggle_lock: async ({ state }: { state?: 'view' | 'edit' }) => {
        const isLocked = getStore().isLocked;
        if (state === 'view' && !isLocked) getStore().toggleLock();
        if (state === 'edit' && isLocked) getStore().toggleLock();
        return `Switched to ${state || 'toggled'} mode.`;
    },

    // 3. Scheduling
    schedule_event: async ({ dayIndex, startHour, startMinute, durationMinutes, labelName, note }: {
        dayIndex: number, startHour: number, startMinute: number, durationMinutes: number, labelName: string, note?: string
    }) => {
        const store = getStore();
        const label = store.labels.find(l => l.name.toLowerCase() === labelName.toLowerCase());
        if (!label) return `Error: Label "${labelName}" not found.`;

        const step = store.config.stepMinutes;
        const slotsNeeded = Math.ceil(durationMinutes / step);
        const startTotalMinutes = startHour * 60 + startMinute;
        const configStartMinutes = store.config.startHour * 60;

        // Calculate start slot index
        let startSlot = Math.floor((startTotalMinutes - configStartMinutes) / step);

        if (startSlot < 0) return `Error: Time is before calendar start time.`;

        const cells = [];
        for (let i = 0; i < slotsNeeded; i++) {
            cells.push({ day: dayIndex, slot: startSlot + i });
        }

        store.setCellsBatch(cells, label.id);

        if (note) {
            // Add note to the first cell
            const key = `${dayIndex}-${startSlot}`;
            store.updateInstanceNote(key, note);
        }

        return `Scheduled "${labelName}" on day ${dayIndex} at ${startHour}:${startMinute}.`;
    },

    clear_blocks: async ({ dayIndex, startHour, startMinute, durationMinutes }: { dayIndex: number, startHour: number, startMinute: number, durationMinutes: number }) => {
        const store = getStore();
        const step = store.config.stepMinutes;
        const slotsNeeded = Math.ceil(durationMinutes / step);
        const startTotalMinutes = startHour * 60 + startMinute;
        const configStartMinutes = store.config.startHour * 60;

        let startSlot = Math.floor((startTotalMinutes - configStartMinutes) / step);
        if (startSlot < 0) return `Error: Time is before calendar start.`;

        const cells = [];
        for (let i = 0; i < slotsNeeded; i++) {
            // 0-based index check? The store handles it mostly, but let's be safe
            cells.push({ day: dayIndex, slot: startSlot + i });
        }

        store.setCellsBatch(cells, null); // Pass null to clear
        return `Cleared blocks on day ${dayIndex} from ${startHour}:${startMinute}.`;
    },

    set_block_note: async ({ dayIndex, hour, minute, note }: { dayIndex: number, hour: number, minute: number, note: string }) => {
        const store = getStore();
        const step = store.config.stepMinutes;
        const startTotalMinutes = hour * 60 + minute;
        const configStartMinutes = store.config.startHour * 60;
        const startSlot = Math.floor((startTotalMinutes - configStartMinutes) / step);

        const key = `${dayIndex}-${startSlot}`;
        store.updateInstanceNote(key, note);
        return `Updated note for block at ${dayIndex}, ${hour}:${minute}`;
    },

    // 4. Stories / Reminders
    add_story: async ({ dayIndex, hour, minute, title, content }: { dayIndex: number, hour: number, minute: number, title: string, content: string }) => {
        getStore().addStory({
            dayIndex,
            hour,
            minute,
            title,
            content // Description/Reminder
        });
        return `Created reminder "${title}" for day ${dayIndex} at ${hour}:${minute}.`;
    },

    // 5. Maintenance
    clear_calendar: async () => {
        getStore().clearSchedule();
        return `Calendar cleared completely.`;
    }
};

/**
 * Executes a raw AI action with the Store.
 * In a real LLM scenario, this would parse the JSON output from the model.
 */
export async function executeAIAction(action: AIAction) {
    console.log(`[AI EXEC] Tool: ${action.tool}`, action.parameters);

    switch (action.tool) {
        case 'create_label': return AI_TOOLS.create_label(action.parameters);
        case 'update_label': return AI_TOOLS.update_label(action.parameters);
        case 'delete_label': return AI_TOOLS.delete_label(action.parameters);
        case 'select_label': return AI_TOOLS.select_label(action.parameters);
        case 'set_config': return AI_TOOLS.set_config(action.parameters);
        case 'schedule_event': return AI_TOOLS.schedule_event(action.parameters);
        case 'clear_blocks': return AI_TOOLS.clear_blocks(action.parameters);
        case 'set_block_note': return AI_TOOLS.set_block_note(action.parameters);
        case 'add_story': return AI_TOOLS.add_story(action.parameters);
        case 'clear_calendar': return AI_TOOLS.clear_calendar();
        case 'toggle_lock': return AI_TOOLS.toggle_lock(action.parameters);
        default:
            return "Unknown tool";
    }
}
