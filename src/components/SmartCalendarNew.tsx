import { useCalendarStore, DEFAULT_LABELS } from '../store/calendarStore';
import { Button } from './Button';
import clsx from 'clsx';
import { useState, useEffect } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function SmartCalendar() {
    const { config, schedule, labels, stories, isLocked, setConfig, setCellsBatch, clearSchedule, addLabel, removeLabel, updateLabelNotes, toggleLock, addStory, updateStory, removeStory } = useCalendarStore();
    const [selectedBrush, setSelectedBrush] = useState<string>(DEFAULT_LABELS[0].id);
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
    const [viewingStoryId, setViewingStoryId] = useState<string | null>(null);
    const [isCreatingStory, setIsCreatingStory] = useState(false);

    // Selection State
    const [selectionStart, setSelectionStart] = useState<{ col: number, row: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{ col: number, row: number } | null>(null);

    // Real-time clock
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Creation State
    const [newLabelName, setNewLabelName] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('#8B5CF6');

    const handleAddLabel = () => {
        if (newLabelName.trim()) {
            addLabel(newLabelName.trim(), newLabelColor);
            setNewLabelName('');
        }
    };

    // Story Creation State
    const [newStoryTitle, setNewStoryTitle] = useState('');
    const [newStoryDesc, setNewStoryDesc] = useState('');
    const [newStoryDay, setNewStoryDay] = useState(0);
    const [newStoryHour, setNewStoryHour] = useState(8);
    const [newStoryMinute, setNewStoryMinute] = useState(0);

    const handleAddStory = () => {
        if (newStoryTitle.trim()) {
            addStory({
                dayIndex: newStoryDay,
                hour: newStoryHour,
                minute: newStoryMinute,
                title: newStoryTitle,
                content: newStoryDesc
            });
            setNewStoryTitle('');
            setNewStoryDesc('');
            setIsCreatingStory(false);
        }
    };

    // Drag Logic
    const handleMouseDown = (col: number, row: number) => {
        if (isLocked) return;
        setSelectionStart({ col, row });
        setSelectionEnd({ col, row }); // Init end same as start
    };

    const handleMouseEnter = (col: number, row: number) => {
        if (isLocked) return;
        if (selectionStart) {
            setSelectionEnd({ col, row });
        }
    };

    const handleMouseUp = () => {
        if (isLocked) {
            setSelectionStart(null);
            setSelectionEnd(null);
            return;
        }
        if (selectionStart && selectionEnd) {
            // Logic: If plain click (1 cell) and same color -> Toggle Off (Erase)
            // If Range -> Always Paint

            const minCol = Math.min(selectionStart.col, selectionEnd.col);
            const maxCol = Math.max(selectionStart.col, selectionEnd.col);
            const minRow = Math.min(selectionStart.row, selectionEnd.row);
            const maxRow = Math.max(selectionStart.row, selectionEnd.row);

            const isSingleCell = minCol === maxCol && minRow === maxRow;
            let labelToApply: string | null = selectedBrush;

            if (isSingleCell) {
                const key = `${minCol}-${minRow}`;
                const currentLabel = schedule[key];
                if (currentLabel === selectedBrush) {
                    labelToApply = null; // Toggle off
                }
            }

            const cellsToUpdate = [];
            for (let c = minCol; c <= maxCol; c++) {
                for (let r = minRow; r <= maxRow; r++) {
                    cellsToUpdate.push({ day: c, slot: r });
                }
            }

            setCellsBatch(cellsToUpdate, labelToApply);
        }

        // Reset
        setSelectionStart(null);
        setSelectionEnd(null);
    };

    // Attach global mouseup
    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [selectionStart, selectionEnd, selectedBrush, schedule, isLocked]);


    // --- Calculations ---
    // Helper to check if a cell is inside the CURRENT selection rect (for visual preview)
    const isCellSelected = (col: number, row: number) => {
        if (!selectionStart || !selectionEnd) return false;
        const minCol = Math.min(selectionStart.col, selectionEnd.col);
        const maxCol = Math.max(selectionStart.col, selectionEnd.col);
        const minRow = Math.min(selectionStart.row, selectionEnd.row);
        const maxRow = Math.max(selectionStart.row, selectionEnd.row);

        return col >= minCol && col <= maxCol && row >= minRow && row <= maxRow;
    };

    const slots = [];
    let currentMin = config.startHour * 60;
    const endMin = config.endHour * 60;

    while (currentMin < endMin) {
        const h = Math.floor(currentMin / 60);
        const m = currentMin % 60;
        const timeLabel = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        slots.push({ label: timeLabel, totalMinutes: currentMin });
        currentMin += config.stepMinutes;
    }

    const startTotalMins = config.startHour * 60;
    const endTotalMins = config.endHour * 60;
    const currentTotalMins = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() / 60);
    const isTimeVisible = currentTotalMins >= startTotalMins && currentTotalMins <= endTotalMins;
    const range = endTotalMins - startTotalMins;
    const elapsed = currentTotalMins - startTotalMins;
    const percentage = (elapsed / range) * 100;

    const handleConfigChange = (key: keyof typeof config, value: string) => {
        const num = parseInt(value);
        if (!isNaN(num)) setConfig({ [key]: num });
    };

    // Get brush color object for preview
    const activeBrushObj = labels.find(l => l.id === selectedBrush);
    const editingLabel = labels.find(l => l.id === editingLabelId);
    const viewingStory = stories.find(s => s.id === viewingStoryId);

    return (
        <div className="flex h-screen w-full overflow-hidden relative">
            {/* Sidebar - Configuration Panel */}
            <aside
                className={clsx(
                    "absolute md:relative z-40 h-full w-80 bg-slate-950/80 backdrop-blur-xl border-r border-slate-800 transition-all duration-500 ease-in-out transform flex flex-col font-sans shadow-2xl",
                    isLocked ? "-translate-x-full opacity-0 md:w-0 md:opacity-0 overflow-hidden" : "translate-x-0 opacity-100"
                )}
            >
                <div className="p-6 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Header in Sidebar */}
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-1">Settings</h2>
                        <p className="text-xs text-slate-500 uppercase tracking-widest">Configure Schedule</p>
                    </div>

                    {/* Time Configs */}
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase">Start Hour</label>
                            <input type="number" min="0" max="23" className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 transition-colors outline-none" value={config.startHour} onChange={(e) => handleConfigChange('startHour', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase">End Hour</label>
                            <input type="number" min="1" max="24" className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 transition-colors outline-none" value={config.endHour} onChange={(e) => handleConfigChange('endHour', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase">Step (Min)</label>
                            <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 transition-colors outline-none cursor-pointer" value={config.stepMinutes} onChange={(e) => handleConfigChange('stepMinutes', e.target.value)}>
                                <option value="10">10 Min</option>
                                <option value="15">15 Min</option>
                                <option value="20">20 Min</option>
                                <option value="30">30 Min</option>
                                <option value="60">60 Min</option>
                            </select>
                        </div>
                    </div>

                    <div className="w-full border-t border-slate-800/50" />

                    {/* Label Creator */}
                    <div className="space-y-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase">Manage Labels</label>
                        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1.5 focus-within:border-emerald-500/50 transition-colors w-full shadow-inner">
                            <input
                                type="text"
                                placeholder="New Label..."
                                className="flex-1 bg-transparent border-none text-sm outline-none px-2 text-slate-200 placeholder:text-slate-600 min-w-0"
                                value={newLabelName}
                                onChange={(e) => setNewLabelName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
                            />
                            <div className="flex items-center gap-2 pr-1">
                                <div className="relative group cursor-pointer w-6 h-6 rounded-md overflow-hidden ring-1 ring-slate-700 hover:ring-slate-500 transition-all">
                                    <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: newLabelColor }} />
                                    <input type="color" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} title="Choose Color" />
                                </div>
                                <button onClick={handleAddLabel} className="bg-slate-800 hover:bg-emerald-600 text-white p-1 rounded-md transition-all duration-300 shadow active:scale-95">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Label List in Sidebar */}
                        <div className="flex flex-wrap gap-2 pt-2">
                            {labels.map(lbl => (
                                <div
                                    key={lbl.id}
                                    onClick={() => setSelectedBrush(lbl.id)}
                                    className={clsx(
                                        "px-3 py-1.5 rounded-md text-xs font-medium border flex items-center gap-2 transition-all cursor-pointer group select-none w-full hover:bg-slate-800/50",
                                        selectedBrush === lbl.id ? "ring-1 ring-offset-1 ring-offset-slate-950" : "opacity-90 hover:opacity-100"
                                    )}
                                    style={{
                                        backgroundColor: `${lbl.color}15`,
                                        borderColor: lbl.color,
                                        color: lbl.color
                                    }}
                                >
                                    <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: lbl.color }} />
                                    <span className="flex-1 truncate">{lbl.name}</span>

                                    <button
                                        className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity p-1"
                                        onClick={(e) => { e.stopPropagation(); setEditingLabelId(lbl.id); }}
                                        title="Edit Notes"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="m2.695 14.762-1.262 3.155a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.886L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" /></svg>
                                    </button>

                                    {!['work', 'rest', 'bio'].includes(lbl.id) && (
                                        <span className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-colors p-1" onClick={(e) => { e.stopPropagation(); removeLabel(lbl.id); }}>×</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="w-full border-t border-slate-800/50" />

                {/* Stories Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-500 uppercase">Stories</label>
                        <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse"></div>
                    </div>

                    {!isCreatingStory ? (
                        <Button size="sm" onClick={() => setIsCreatingStory(true)} className="w-full dashed border-slate-700 text-slate-400 hover:text-white hover:border-emerald-500 hover:bg-emerald-500/10 transition-all">
                            + Add Story
                        </Button>
                    ) : (
                        <div className="space-y-3 bg-slate-900/50 p-3 rounded-lg border border-slate-800 animate-in fade-in zoom-in-95">
                            <input
                                type="text"
                                placeholder="Title"
                                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200 outline-none focus:border-red-500 transition-colors"
                                value={newStoryTitle}
                                onChange={(e) => setNewStoryTitle(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <select className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 outline-none flex-1" value={newStoryDay} onChange={(e) => setNewStoryDay(Number(e.target.value))}>
                                    {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                                </select>
                                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1">
                                    <input type="number" min="0" max="23" className="w-8 bg-transparent text-center text-xs outline-none" value={newStoryHour} onChange={(e) => setNewStoryHour(Number(e.target.value))} />
                                    <span className="text-slate-500">:</span>
                                    <input type="number" min="0" max="59" className="w-8 bg-transparent text-center text-xs outline-none" value={newStoryMinute} onChange={(e) => setNewStoryMinute(Number(e.target.value))} />
                                </div>
                            </div>
                            <textarea
                                className="w-full h-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 outline-none resize-none"
                                placeholder="Description..."
                                value={newStoryDesc}
                                onChange={(e) => setNewStoryDesc(e.target.value)}
                            />
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setIsCreatingStory(false)} className="text-xs text-slate-500 hover:text-white transition-colors">Cancel</button>
                                <button onClick={handleAddStory} className="text-xs bg-red-500/20 text-red-400 border border-red-500/50 px-3 py-1 rounded hover:bg-red-500 hover:text-white transition-all">Save</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="pt-8">
                    <Button size="sm" variant="danger" className="w-full" onClick={clearSchedule}>Clear Entire Schedule</Button>
                </div>
            </aside>

            {/* Main Content - Calendar */}
            <main className="flex-1 relative h-full flex flex-col bg-slate-950/20">
                {/* Top Bar (Title + Toggle) */}
                <div className="flex-none p-6 flex justify-between items-center z-30">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleLock}
                            className={clsx(
                                "w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 shadow-lg border backdrop-blur-sm z-50",
                                isLocked
                                    ? "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 hover:scale-105"
                                    : "bg-emerald-500/10 border-emerald-500 text-emerald-400 hover:bg-emerald-500/20"
                            )}
                            title={isLocked ? "Open Settings" : "Close & Lock Settings"}
                        >
                            {isLocked ? (
                                // Menu / Settings Icon / Right Arrow
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                                </svg>
                            ) : (
                                // Left Arrow / Close
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                            )}
                        </button>

                        <h2 className="text-3xl font-bold text-white flex items-center gap-3 drop-shadow-md">
                            Smart Schedule
                            {isLocked && <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 border border-slate-800 px-2 py-0.5 rounded-full bg-slate-950/50">Viewing Mode</span>}
                        </h2>
                    </div>

                    <div className="px-6 py-2 rounded-xl bg-slate-900/50 border border-slate-800/50 font-mono text-emerald-400 font-bold animate-pulse shadow-lg backdrop-blur">
                        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                </div>

                {/* Calendar Grid Container */}
                <div className="flex-1 overflow-auto p-6 pt-0 custom-scrollbar">
                    <div className={clsx("glass-panel p-1 relative select-none transition-all duration-500", !isLocked ? "ml-4" : "mx-auto max-w-6xl")}>
                        {/* Lock Overlay on Grid (Only necessary if we want to block interaction, but isLocked handles logic) */}
                        {isLocked && <div className="absolute inset-0 z-50 bg-transparent" />}

                        {/* Real-time Arrow */}
                        {isTimeVisible && (
                            <div
                                className="absolute w-full flex items-center z-20 pointer-events-none transition-all duration-1000 ease-linear"
                                style={{ top: `calc(36px + (100% - 36px) * ${percentage / 100})` }}
                            >
                                <div className="w-20 pr-2 flex justify-end">
                                    <div className="text-white/30 font-bold text-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">➤</div>
                                </div>
                                <div className="flex-1 h-1 bg-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)]"></div>
                            </div>
                        )}

                        <div className="overflow-x-auto relative z-10">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr>
                                        <th className="p-2 text-left w-20 text-slate-500 font-mono text-xs bg-slate-900/50 backdrop-blur">TIME</th>
                                        {DAYS.map(day => (
                                            <th key={day} className="p-2 text-center text-slate-300 font-bold border-b border-slate-700 w-[12%] bg-slate-900/50 backdrop-blur">{day}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {slots.map((slot, rowIndex) => (
                                        <tr key={rowIndex} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors h-8">
                                            <td className="p-2 text-slate-500 font-mono text-xs border-r border-slate-800 relative group/time">
                                                {slot.label}
                                                {/* Check for stories at this time */}
                                                {stories.filter(s => {
                                                    const storyMinutes = s.hour * 60 + s.minute;
                                                    return storyMinutes >= slot.totalMinutes && storyMinutes < slot.totalMinutes + config.stepMinutes;
                                                }).map(story => (
                                                    <div
                                                        key={story.id}
                                                        className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 cursor-pointer shadow-[0_0_5px_rgba(239,68,68,0.8)] hover:scale-150 transition-transform z-20"
                                                        onMouseEnter={() => !isLocked && setViewingStoryId(story.id)}
                                                        onClick={() => setViewingStoryId(story.id)} // Click works in both modes
                                                    />
                                                ))}
                                            </td>
                                            {DAYS.map((_, colIndex) => {
                                                const cellKey = `${colIndex}-${rowIndex}`;
                                                const labelId = schedule[cellKey];
                                                // Find actual label obj for color (Committed)
                                                const labelObj = labels.find(l => l.id === labelId);

                                                // Selection Preview Check
                                                const isSelected = isCellSelected(colIndex, rowIndex);

                                                return (
                                                    <td
                                                        key={colIndex}
                                                        className="p-0 border-r border-slate-800/30 relative h-8 cursor-pointer group"
                                                        onMouseDown={() => handleMouseDown(colIndex, rowIndex)}
                                                        onMouseEnter={() => handleMouseEnter(colIndex, rowIndex)}
                                                    >
                                                        {/* Committed Layer */}
                                                        {labelObj && (
                                                            <div
                                                                className="absolute inset-0 w-full h-full border-l-2 pl-1 flex items-center overflow-hidden transition-all duration-300"
                                                                style={{
                                                                    backgroundColor: `${labelObj.color}30`,
                                                                    borderColor: labelObj.color
                                                                }}
                                                            >
                                                                <span className="text-[10px] uppercase font-bold tracking-tighter opacity-70 truncate px-1" style={{ color: labelObj.color }}>
                                                                    {labelObj.name}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Selection Preview Overlay */}
                                                        {isSelected && activeBrushObj && (
                                                            <div
                                                                className="absolute inset-0 w-full h-full z-10 opacity-50"
                                                                style={{
                                                                    backgroundColor: activeBrushObj.color
                                                                }}
                                                            />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {/* Notes Modal / Overlay */}
            {
                editingLabel && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div
                            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200"
                            style={{ boxShadow: `0 0 50px ${editingLabel.color}30` }} // Glow
                        >
                            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: editingLabel.color }} />
                                    {editingLabel.name} <span className="text-slate-500 font-normal text-sm">Notes</span>
                                </h3>
                                <button onClick={() => setEditingLabelId(null)} className="text-slate-400 hover:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                        <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                            <div className="p-4 space-y-2">
                                <p className="text-xs text-slate-500 uppercase font-mono">Scratchpad</p>
                                <textarea
                                    className="w-full h-64 bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-300 focus:outline-none focus:border-slate-600 resize-none font-sans leading-relaxed"
                                    placeholder="Add instructions, to-do lists, or thoughts for this category..."
                                    value={editingLabel.notes || ''}
                                    onChange={(e) => updateLabelNotes(editingLabel.id, e.target.value)}
                                />
                            </div>
                            <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex justify-end">
                                <Button onClick={() => setEditingLabelId(null)}>Close & Save</Button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Story Viewer Modal */}
            {
                viewingStory && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent pointer-events-none">
                        {/* We use pointer-events-none on container to let clicks pass through if needed, but here we want a modal feel.
                         However, user asked for "When arrow passes... opens until ready!".
                         For now, let's make it a standard centered modal that is clearly visible.
                      */}
                        <div className="pointer-events-auto bg-slate-950 border border-red-500/50 rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-red-900/50">
                            <div className="p-3 bg-red-950/20 border-b border-red-900/30 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                    <h3 className="font-bold text-red-100">{viewingStory.title}</h3>
                                </div>
                                <div className="text-xs text-red-400 font-mono">
                                    {DAYS[viewingStory.dayIndex]} @ {viewingStory.hour.toString().padStart(2, '0')}:{viewingStory.minute.toString().padStart(2, '0')}
                                </div>
                            </div>

                            <div className="p-4">
                                {/* Content - Editable if Config Mode (not locked) */}
                                {!isLocked ? (
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-[10px] uppercase text-slate-500 font-bold">Title</label>
                                                <input
                                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white"
                                                    value={viewingStory.title}
                                                    onChange={(e) => updateStory(viewingStory.id, { title: e.target.value })}
                                                />
                                            </div>
                                            <div className="w-24 space-y-1">
                                                <label className="text-[10px] uppercase text-slate-500 font-bold">Time</label>
                                                <div className="flex items-center gap-1">
                                                    <input type="number" className="w-full bg-slate-900 border border-slate-800 rounded px-1 py-1 text-sm text-center" value={viewingStory.hour} onChange={(e) => updateStory(viewingStory.id, { hour: Number(e.target.value) })} />
                                                    :
                                                    <input type="number" className="w-full bg-slate-900 border border-slate-800 rounded px-1 py-1 text-sm text-center" value={viewingStory.minute} onChange={(e) => updateStory(viewingStory.id, { minute: Number(e.target.value) })} />
                                                </div>
                                            </div>
                                        </div>
                                        <textarea
                                            className="w-full h-32 bg-slate-900 border border-slate-800 rounded p-2 text-sm text-slate-300 resize-none focus:border-red-500/50 outline-none"
                                            value={viewingStory.content}
                                            onChange={(e) => updateStory(viewingStory.id, { content: e.target.value })}
                                        />
                                        <div className="flex justify-between pt-2">
                                            <button onClick={() => { removeStory(viewingStory.id); setViewingStoryId(null); }} className="text-red-500 hover:text-red-400 text-xs underline decoration-red-500/30">Delete Story</button>
                                            <Button size="sm" onClick={() => setViewingStoryId(null)}>Done</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                            {viewingStory.content || "No details provided."}
                                        </div>
                                        <div className="flex justify-end pt-2">
                                            <Button size="sm" variant="danger" onClick={() => setViewingStoryId(null)}>Close</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
}
