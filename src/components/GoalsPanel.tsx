import { memo, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useCalendarStore, goalCheckKey, localDayKey } from '../store/calendarStore';
import { useLanguage } from '../hooks/useLanguage';

/** The three sections of the goals area (they mirror the schedule's week / edit / day modes). */
export type GoalsMode = 'day' | 'edit' | 'month';

/** Color used for goals created from scratch (the app's accent). */
const DEFAULT_GOAL_COLOR = '#10B981';

const CARD = "glass-panel p-1 relative transition-all duration-500 mb-16 mx-auto shadow-2xl ring-1 ring-slate-900/5 bg-white rounded-xl my-4 animate-in fade-in slide-in-from-bottom-2";
const CARD_NARROW = "w-[90%] max-w-[340px]";
const CARD_HEADER = "flex items-baseline justify-between gap-2 py-1 px-2 border-b border-emerald-500 bg-emerald-50 text-emerald-700 rounded-t-lg shadow-[0_0_15px_rgba(16,185,129,0.1)]";

interface GoalRow {
    id: string;
    name: string;
    color: string;
    /** True when the goal follows a schedule label (its name and color come from the label). */
    linked: boolean;
}

interface GoalsPanelProps {
    mode: GoalsMode;
    /** Local date key (YYYY-MM-DD) of today. */
    todayKey: string;
    /** Called when an empty view offers to go create goals. */
    onCreateRequest: () => void;
}

function parseDayKey(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function shiftMonth(monthKey: string, delta: number): string {
    const [y, m] = monthKey.split('-').map(Number);
    return localDayKey(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

/** Goals with their label (if any) already resolved to a name and a color. */
function useGoalRows(): GoalRow[] {
    const goals = useCalendarStore(state => state.goals);
    const labels = useCalendarStore(state => state.labels);
    return useMemo(() => goals.map(goal => {
        const label = goal.labelId ? labels.find(l => l.id === goal.labelId) : undefined;
        return {
            id: goal.id,
            name: label?.name ?? goal.name,
            color: label?.color ?? goal.color ?? DEFAULT_GOAL_COLOR,
            linked: !!label
        };
    }), [goals, labels]);
}

function EmptyGoals({ onCreateRequest }: { onCreateRequest: () => void }) {
    const { t } = useLanguage();
    return (
        <div className="flex flex-col items-center gap-3 py-6 px-2">
            <p className="text-[10px] text-slate-400 italic text-center">{t('goalsEmpty')}</p>
            <button
                type="button"
                onClick={onCreateRequest}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md shadow-emerald-500/20 transition-all active:scale-95"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {t('createGoals')}
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 1. DAY: the vertical checklist for one day of the current week (Mon-Sun)
// ---------------------------------------------------------------------------
function GoalsDay({ rows, todayKey, onCreateRequest }: { rows: GoalRow[]; todayKey: string; onCreateRequest: () => void }) {
    const { t, days, language } = useLanguage();
    const goalChecks = useCalendarStore(state => state.goalChecks);
    const toggleGoalCheck = useCalendarStore(state => state.toggleGoalCheck);

    // The picked day only holds while "today" stays the same; at midnight the view follows the new day.
    const [picked, setPicked] = useState({ day: todayKey, today: todayKey });
    const selectedDay = picked.today === todayKey ? picked.day : todayKey;

    const week = useMemo(() => {
        const today = parseDayKey(todayKey);
        const mondayOffset = (today.getDay() + 6) % 7; // 0 = Monday
        return days.map((name, index) => {
            const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index - mondayOffset);
            return { key: localDayKey(date), name, number: date.getDate() };
        });
    }, [todayKey, days]);

    const doneOn = (dayKey: string) => rows.filter(r => goalChecks[goalCheckKey(r.id, dayKey)]).length;
    const doneCount = doneOn(selectedDay);
    const percentage = rows.length === 0 ? 0 : (doneCount / rows.length) * 100;
    const selectedLabel = `${week.find(d => d.key === selectedDay)?.name ?? ''} ${parseDayKey(selectedDay).toLocaleDateString(language, { day: 'numeric', month: 'short' })}`;

    return (
        <div className={clsx(CARD, CARD_NARROW)}>
            <div className={CARD_HEADER}>
                <h2 className="text-lg font-bold tracking-tighter">{t('goals')}</h2>
                <span className="font-mono text-[10px] font-bold whitespace-nowrap">
                    {selectedLabel} · {doneCount}/{rows.length}
                </span>
            </div>

            {/* Week strip: Monday to Sunday */}
            <div className="flex border-b border-slate-200">
                {week.map(day => {
                    const isToday = day.key === todayKey;
                    const isFuture = day.key > todayKey;
                    const done = doneOn(day.key);
                    return (
                        <button
                            type="button"
                            key={day.key}
                            disabled={isFuture}
                            aria-pressed={day.key === selectedDay}
                            onClick={() => setPicked({ day: day.key, today: todayKey })}
                            className={clsx(
                                "flex-1 flex flex-col items-center gap-0.5 pt-1 pb-1.5 border-b-2 transition-colors",
                                isToday ? "text-emerald-700 bg-emerald-50" : "text-slate-600 hover:bg-slate-100",
                                day.key === selectedDay ? "border-emerald-500" : "border-transparent",
                                isFuture && "opacity-40 hover:bg-transparent cursor-default"
                            )}
                        >
                            <span className="text-[9px] font-mono uppercase leading-3">{day.name}</span>
                            <span className="text-sm font-bold tracking-tighter leading-4">{day.number}</span>
                            <span className={clsx(
                                "w-1.5 h-1.5 rounded-full",
                                rows.length > 0 && done === rows.length ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.6)]" : done > 0 ? "bg-emerald-300" : "bg-slate-200"
                            )} />
                        </button>
                    );
                })}
            </div>

            {/* Progress of the selected day */}
            <div className="h-0.5 w-full bg-slate-200">
                <div
                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all duration-500 ease-out"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {rows.length === 0 ? <EmptyGoals onCreateRequest={onCreateRequest} /> : (
                <ul>
                    {rows.map(row => {
                        const done = !!goalChecks[goalCheckKey(row.id, selectedDay)];
                        return (
                            <li
                                key={row.id}
                                className="border-b border-slate-200 last:border-b-0 border-l-2 transition-colors duration-300"
                                style={{ borderLeftColor: row.color, backgroundColor: done ? 'transparent' : `${row.color}18` }}
                            >
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={done}
                                    onClick={() => toggleGoalCheck(row.id, selectedDay)}
                                    className="w-full flex items-center gap-2.5 min-h-10 pl-2 pr-2 py-1.5 text-left transition-transform active:scale-[0.99]"
                                >
                                    <span
                                        className="flex-none w-4 h-4 rounded-[3px] border-2 flex items-center justify-center transition-colors"
                                        style={{ borderColor: row.color, backgroundColor: done ? row.color : '#ffffff' }}
                                    >
                                        {done && (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={4} stroke="currentColor" className="w-3 h-3 text-white">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className={clsx(
                                        "text-xs font-medium tracking-tight leading-4 break-words min-w-0 transition-colors",
                                        done ? "line-through text-slate-400" : "text-slate-700"
                                    )}>
                                        {row.name}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// 2. EDIT: create, rename, recolor and delete goals
// ---------------------------------------------------------------------------

/** Native color picker that commits once the user stops dragging (one save instead of dozens). */
function GoalColorPicker({ color, label, onCommit }: { color: string; label: string; onCommit: (color: string) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    return (
        <label className="flex-none relative w-4 h-4 rounded-[3px] shadow-sm cursor-pointer ring-1 ring-black/5" style={{ backgroundColor: draft ?? color }} title={label}>
            <input
                type="color"
                aria-label={label}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={draft ?? color}
                onChange={(e) => {
                    const next = e.target.value;
                    setDraft(next);
                    if (timer.current) clearTimeout(timer.current);
                    timer.current = setTimeout(() => { onCommit(next); setDraft(null); }, 500);
                }}
            />
        </label>
    );
}

function GoalsEdit({ rows }: { rows: GoalRow[] }) {
    const { t } = useLanguage();
    const goals = useCalendarStore(state => state.goals);
    const labels = useCalendarStore(state => state.labels);
    const addGoal = useCalendarStore(state => state.addGoal);
    const updateGoal = useCalendarStore(state => state.updateGoal);
    const removeGoal = useCalendarStore(state => state.removeGoal);

    const [newGoalName, setNewGoalName] = useState('');
    const [newGoalColor, setNewGoalColor] = useState(DEFAULT_GOAL_COLOR);

    // Labels that are not in the list yet
    const availableLabels = useMemo(
        () => labels.filter(l => !goals.some(g => g.labelId === l.id)),
        [labels, goals]
    );

    const handleAdd = () => {
        const name = newGoalName.trim();
        if (!name) return;
        addGoal(name, { color: newGoalColor });
        setNewGoalName('');
    };

    return (
        <div className={clsx(CARD, CARD_NARROW)}>
            <div className={CARD_HEADER}>
                <h2 className="text-lg font-bold tracking-tighter">{t('myGoals')}</h2>
                <span className="font-mono text-[10px] font-bold whitespace-nowrap">{rows.length}</span>
            </div>

            {rows.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic text-center py-5 px-2">{t('goalsEmpty')}</p>
            ) : (
                <ul>
                    {rows.map(row => (
                        <li
                            key={row.id}
                            className="flex items-center gap-2 min-h-10 pl-2 border-b border-slate-200 border-l-2"
                            style={{ borderLeftColor: row.color, backgroundColor: `${row.color}18` }}
                        >
                            {row.linked ? (
                                <>
                                    <span className="flex-none w-4 h-4 rounded-[3px] shadow-sm ring-1 ring-black/5" style={{ backgroundColor: row.color }} />
                                    <span className="flex-1 min-w-0 text-base sm:text-xs font-medium tracking-tight text-slate-700 truncate">{row.name}</span>
                                    <span className="flex-none text-[8px] font-mono font-bold uppercase text-slate-400 border border-slate-300 rounded px-1 bg-white/60">{t('goalFromLabel')}</span>
                                </>
                            ) : (
                                <>
                                    <GoalColorPicker color={row.color} label={t('goalColor')} onCommit={(color) => updateGoal(row.id, { color })} />
                                    <input
                                        // Uncontrolled: remounts when the saved name changes (rename from another device)
                                        key={row.name}
                                        type="text"
                                        defaultValue={row.name}
                                        maxLength={80}
                                        aria-label={t('goalName')}
                                        className="flex-1 min-w-0 bg-transparent border-b border-transparent focus:border-emerald-500 text-base sm:text-xs font-medium tracking-tight text-slate-700 outline-none py-1 transition-colors"
                                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                        onBlur={(e) => {
                                            const name = e.currentTarget.value.trim();
                                            if (!name) e.currentTarget.value = row.name;
                                            else if (name !== row.name) updateGoal(row.id, { name });
                                        }}
                                    />
                                </>
                            )}
                            <button
                                type="button"
                                onClick={() => { if (confirm(t('confirmDeleteGoal'))) removeGoal(row.id); }}
                                className="flex-none self-stretch px-2.5 text-slate-400/70 hover:text-red-500 transition-colors"
                                title={t('deleteGoal')}
                                aria-label={`${t('deleteGoal')}: ${row.name}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {/* Create from scratch (same control as the label creator) */}
            <div className="p-2">
                <div className="flex gap-1.5 bg-slate-50 border border-slate-200 rounded p-1 pl-2 shadow-inner items-center focus-within:border-emerald-500 transition-colors">
                    <label className="flex-none relative w-4 h-4 rounded-[3px] shadow-sm cursor-pointer ring-1 ring-black/5" style={{ backgroundColor: newGoalColor }} title={t('goalColor')}>
                        <input
                            type="color"
                            aria-label={t('goalColor')}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            value={newGoalColor}
                            onChange={(e) => setNewGoalColor(e.target.value)}
                        />
                    </label>
                    <input
                        type="text"
                        placeholder={t('newGoal')}
                        aria-label={t('newGoal')}
                        // 16px on phones so iOS does not zoom the page when the field gets focus
                        className="flex-1 bg-transparent border-none text-base sm:text-xs outline-none px-1 text-slate-900 placeholder:text-slate-400 min-w-0"
                        value={newGoalName}
                        maxLength={80}
                        onChange={(e) => setNewGoalName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={!newGoalName.trim()}
                        className="flex-none bg-emerald-600/20 hover:bg-emerald-600 text-emerald-500 hover:text-white p-1 rounded transition-all disabled:opacity-40 disabled:hover:bg-emerald-600/20 disabled:hover:text-emerald-500"
                        title={t('addGoal')}
                        aria-label={t('addGoal')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                    </button>
                </div>

                {/* Optional: reuse a schedule label */}
                {availableLabels.length > 0 && (
                    <div className="mt-2">
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t('goalsFromLabels')}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {availableLabels.map(lbl => (
                                <button
                                    type="button"
                                    key={lbl.id}
                                    onClick={() => addGoal(lbl.name, { labelId: lbl.id, color: lbl.color })}
                                    className="px-2 py-1 rounded text-[10px] font-medium border flex items-center gap-1.5 transition-all select-none opacity-80 hover:opacity-100 hover:bg-slate-100 active:scale-95"
                                    style={{ backgroundColor: `${lbl.color}10`, borderColor: lbl.color }}
                                >
                                    <span className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]" style={{ backgroundColor: lbl.color }} />
                                    <span className="max-w-[120px] truncate">{lbl.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 3. MONTH: the whole journey, goals (rows) x days of the month (columns)
// ---------------------------------------------------------------------------
function GoalsMonth({ rows, todayKey, onCreateRequest }: { rows: GoalRow[]; todayKey: string; onCreateRequest: () => void }) {
    const { t, days, language } = useLanguage();
    const goalChecks = useCalendarStore(state => state.goalChecks);
    const toggleGoalCheck = useCalendarStore(state => state.toggleGoalCheck);
    const loadGoalChecksForMonth = useCalendarStore(state => state.loadGoalChecksForMonth);

    const currentMonth = todayKey.slice(0, 7);
    const [pickedMonth, setPickedMonth] = useState(currentMonth);
    const monthKey = pickedMonth > currentMonth ? currentMonth : pickedMonth;
    const isLoaded = useCalendarStore(state => state.loadedGoalMonths.includes(monthKey));

    // Older months are fetched the first time they are opened
    useEffect(() => {
        if (!isLoaded) void loadGoalChecksForMonth(monthKey);
    }, [monthKey, isLoaded, loadGoalChecksForMonth]);

    const monthDays = useMemo(() => {
        const [y, m] = monthKey.split('-').map(Number);
        const count = new Date(y, m, 0).getDate();
        return Array.from({ length: count }, (_, i) => {
            const date = new Date(y, m - 1, i + 1);
            const key = localDayKey(date);
            return { key, number: i + 1, weekday: (date.getDay() + 6) % 7, isToday: key === todayKey, isFuture: key > todayKey };
        });
    }, [monthKey, todayKey]);

    const rawMonthLabel = parseDayKey(`${monthKey}-01`).toLocaleDateString(language, { month: 'long', year: 'numeric' });
    const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);

    // On narrow screens the month scrolls sideways: in the current month, start with today near the
    // right edge so the days already lived (the ones that can be filled) are the ones on screen.
    const scrollRef = useRef<HTMLDivElement>(null);
    const todayRef = useRef<HTMLTableCellElement>(null);
    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        const target = todayRef.current;
        container.scrollLeft = target ? Math.max(0, target.offsetLeft + target.offsetWidth * 2.5 - container.clientWidth) : 0;
    }, [monthKey]);

    const arrowClass = "p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent";

    return (
        <div className={clsx(CARD, "w-[96%] max-w-[1040px]")}>
            {/* Month switcher */}
            <div className="flex items-center justify-between gap-2 py-0.5 px-1 border-b border-emerald-500 bg-emerald-50 text-emerald-700 rounded-t-lg shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                <button type="button" className={arrowClass} onClick={() => setPickedMonth(shiftMonth(monthKey, -1))} title={t('prevMonth')} aria-label={t('prevMonth')}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>
                <h2 className="text-lg font-bold tracking-tighter">{monthLabel}</h2>
                <button type="button" className={arrowClass} disabled={monthKey >= currentMonth} onClick={() => setPickedMonth(shiftMonth(monthKey, 1))} title={t('nextMonth')} aria-label={t('nextMonth')}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                </button>
            </div>

            {rows.length === 0 ? <EmptyGoals onCreateRequest={onCreateRequest} /> : (
                <div ref={scrollRef} className={clsx("overflow-x-auto overscroll-x-none custom-scrollbar transition-opacity duration-300", !isLoaded && "opacity-50")}>
                    <table className="w-full text-sm border-separate border-spacing-0">
                        <thead>
                            <tr>
                                <th className="sticky left-0 z-20 w-28 min-w-28 max-w-28 py-1 px-2 text-left text-slate-500 font-mono text-[9px] uppercase bg-white border-b border-r border-slate-200">
                                    {t('goals')}
                                </th>
                                {monthDays.map(day => (
                                    <th
                                        key={day.key}
                                        ref={day.isToday ? todayRef : undefined}
                                        className={clsx(
                                            "w-7 min-w-7 py-1 px-0 text-center font-normal border-b",
                                            day.isToday
                                                ? "text-emerald-700 bg-emerald-50 border-emerald-500"
                                                : "text-slate-500 border-slate-200",
                                            // A stronger line where each Monday-to-Sunday week starts
                                            day.weekday === 0 && day.number !== 1 && "border-l border-l-slate-300"
                                        )}
                                    >
                                        <div className="text-[8px] font-mono uppercase leading-3">{days[day.weekday].charAt(0)}</div>
                                        <div className={clsx("text-[10px] leading-3", day.isToday ? "font-bold" : "font-medium")}>{day.number}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => {
                                const total = monthDays.filter(day => goalChecks[goalCheckKey(row.id, day.key)]).length;
                                return (
                                    <tr key={row.id} className="h-8">
                                        <td
                                            className="sticky left-0 z-10 w-28 min-w-28 max-w-28 px-1.5 bg-white border-b border-r border-slate-200 border-l-2"
                                            style={{ borderLeftColor: row.color }}
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <span className="text-[10px] font-medium tracking-tight text-slate-700 truncate">{row.name}</span>
                                                <span className="flex-none font-mono text-[9px] font-bold" style={{ color: row.color }}>{total}</span>
                                            </div>
                                        </td>
                                        {monthDays.map(day => {
                                            const done = !!goalChecks[goalCheckKey(row.id, day.key)];
                                            return (
                                                <td
                                                    key={day.key}
                                                    className={clsx(
                                                        "p-0 border-b border-slate-200",
                                                        day.isToday && "bg-emerald-50/50",
                                                        day.weekday === 0 && day.number !== 1 && "border-l border-l-slate-300"
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        role="checkbox"
                                                        aria-checked={done}
                                                        aria-label={`${row.name}, ${day.number}`}
                                                        disabled={day.isFuture || !isLoaded}
                                                        onClick={() => toggleGoalCheck(row.id, day.key)}
                                                        className="w-7 h-8 flex items-center justify-center disabled:cursor-default"
                                                    >
                                                        <span
                                                            className="w-3.5 h-3.5 rounded-[3px] border transition-colors"
                                                            style={done
                                                                ? { backgroundColor: row.color, borderColor: row.color }
                                                                : { backgroundColor: 'transparent', borderColor: day.isFuture ? '#e2e8f0' : `${row.color}80` }}
                                                        />
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/**
 * Goals area: a habit/goal tracker that replaces the schedule when the Horario/Metas switch is on "Metas".
 * - day:   today's vertical checklist, with the Monday-to-Sunday week on top
 * - edit:  where goals are created (from scratch or from a schedule label)
 * - month: the full month table, one arrow click per month
 */
export const GoalsPanel = memo(function GoalsPanel({ mode, todayKey, onCreateRequest }: GoalsPanelProps) {
    const rows = useGoalRows();
    if (mode === 'edit') return <GoalsEdit rows={rows} />;
    if (mode === 'month') return <GoalsMonth rows={rows} todayKey={todayKey} onCreateRequest={onCreateRequest} />;
    return <GoalsDay rows={rows} todayKey={todayKey} onCreateRequest={onCreateRequest} />;
});
