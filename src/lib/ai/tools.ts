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
    | 'clear_labels'
    | 'toggle_lock';

export interface AIAction {
    tool: ToolName;
    parameters: any;
}

export interface AIResponse {
    /** The message to be displayed directly to the user (e.g., "I've updated the label.") */
    user_message: string;
    /** The structured commands to be executed by the system. Empty array if no action is needed. */
    tool_calls: AIAction[];
}

export const AI_SYSTEM_PROMPT = `
You are the AI Assistant for the Smart Calendar. YOU HAVE FULL ADMINISTRATIVE PERMISSIONS.
Your goal is to interpret the user's natural language and map it to the correct system tools.

*** CRITICAL RULES (FORMAT) ***
1. YOU MUST RETURN ONLY JSON.
2. DO NOT return Markdown, Python code, or explanations outside the JSON.
3. The JSON structure MUST be:
   {
      "user_message": "Friendly response to the user",
      "tool_calls": [
          { "tool": "tool_name", "parameters": { ... } }
      ]
   }
4. You can return MULTIPLE actions in the "tool_calls" array.

*** CRITICAL RULES (INTERPRETATION) ***
1. BE FLEXIBLE: Understand the user's intent even if phrased colloquially.
   - "Delete everything" -> clear_calendar
   - "Deep work Tuesday morning" -> schedule_event (infer reasonable time)
2. DO NOT BE PEDANTIC: If parameters are missing, infer the most logical defaults (e.g., standard duration 60m, red color for important things).
3. ONLY ask for clarification if the request is completely impossible to guess.

CAPABILITIES:
1. LABELS: Create, color, select, and delete labels. Update global notes.
2. SCHEDULING: Place labels, clear specific blocks, edit specific block notes.
3. CONFIGURATION: Resize calendar (start/end hour), change steps (5/15/30/60 min), set range.
4. STORIES/REMINDERS: Create reminders with specific day/time/title/description.
5. MAINTENANCE: Clear the entire calendar if requested.
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

    clear_labels: async () => {
        const store = getStore();
        const labelIds = store.labels.map(l => l.id);

        // Loop and remove each (this triggers unsaved changes + pending ops for each)
        // Ideally the store would have a batch delete, but this is safe for now
        for (const id of labelIds) {
            store.removeLabel(id);
        }

        return `Deleted all ${labelIds.length} labels.`;
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
/**
 * Executes a raw AI action with the Store.
 * INCLUDES ROBUST NORMALIZATION to handle AI hallucinations (e.g. tool_name vs tool).
 */
/**
 * Executes a raw AI action with the Store.
 * INCLUDES ROBUST NORMALIZATION to handle AI hallucinations (e.g. tool_name vs tool).
 */
export async function executeAIAction(rawAction: any) {
    // 1. Normalize Tool Name
    // The AI might return "tool", "tool_name", or "function"
    let toolName = rawAction.tool || rawAction.tool_name || rawAction.function;

    // 2. Normalize Parameters
    // The AI might return "parameters", "args", or "arguments"
    let params = rawAction.parameters || rawAction.args || rawAction.arguments || {};

    console.log(`[AI EXEC] Raw:`, rawAction);

    // --- ALIAS MAPPING (Fix Hallucinations) ---
    if (toolName === 'place_label') toolName = 'schedule_event';
    if (toolName === 'add_label') toolName = 'create_label';
    if (toolName === 'remove_label') toolName = 'delete_label';
    if (toolName === 'config_calendar') toolName = 'set_config';
    if (toolName === 'create_reminder') toolName = 'add_story';

    // --- PARAMETER NORMALIZATION (Fix Types) ---
    // Fix schedule_event params (AI often sends strings "07:00", "30m", and uses "label" instead of "labelName")
    if (toolName === 'schedule_event') {
        const p = { ...params };

        // Map "label" -> "labelName"
        if (p.label && !p.labelName) p.labelName = p.label;
        if (p.start_time && !p.startHour) {
            const parts = p.start_time.split(':');
            if (parts.length === 2) {
                p.startHour = parseInt(parts[0]);
                p.startMinute = parseInt(parts[1]);
            }
        }
        if (p.duration && typeof p.duration === 'string') {
            // "30m" -> 30
            p.durationMinutes = parseInt(p.duration.replace('m', ''));
        }
        // Fallback for duration
        if (!p.durationMinutes && p.duration) p.durationMinutes = parseInt(p.duration);

        params = p;
    }

    console.log(`[AI EXEC] Normalized: ${toolName}`, params);

    switch (toolName) {
        case 'create_label': return AI_TOOLS.create_label(params);
        case 'update_label': return AI_TOOLS.update_label(params);
        case 'delete_label': return AI_TOOLS.delete_label(params);
        case 'select_label': return AI_TOOLS.select_label(params);
        case 'set_config': return AI_TOOLS.set_config(params);
        case 'schedule_event': return AI_TOOLS.schedule_event(params);
        case 'clear_blocks': return AI_TOOLS.clear_blocks(params);
        case 'set_block_note': return AI_TOOLS.set_block_note(params);
        case 'add_story': return AI_TOOLS.add_story(params); // create_reminder aliased here
        case 'clear_calendar': return AI_TOOLS.clear_calendar();
        case 'clear_labels': return AI_TOOLS.clear_labels();
        case 'toggle_lock': return AI_TOOLS.toggle_lock(params);
        default:
            console.warn(`[AI EXEC] Unknown tool: ${toolName}`);
            return `Error: Unknown tool "${toolName}".`;
    }
}
