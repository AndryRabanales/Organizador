import { useCalendarStore, DEFAULT_LABELS } from '../store/calendarStore';
import { Button } from './Button';
import clsx from 'clsx';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { WordEditor } from './WordEditor';

import { useLanguage } from '../hooks/useLanguage';

// Removed static DAYS in favor of dynamic DAYS from hook


export function SmartCalendar() {
    const { t, days: DAYS } = useLanguage();
    const { config, schedule, labels, isLocked, instanceNotes, stories, setConfig, setCellsBatch, clearSchedule, addLabel, removeLabel, updateLabelNotes, updateInstanceNote, toggleLock, addTab, closeTab, restoreTab, deleteTabForever, updateCustomTab, reorderTabs, addStory, updateStory, removeStory } = useCalendarStore();
    const [selectedBrush, setSelectedBrush] = useState<string>(DEFAULT_LABELS[0].id);
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
    const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string>('global');
    const [showTrash, setShowTrash] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{ message: string, onConfirm: () => void, onCancel?: () => void } | null>(null);
    const [activeBottomPanel, setActiveBottomPanel] = useState<'none' | 'config' | 'story'>('none');

    // Drag State
    const [draggedTab, setDraggedTab] = useState<string | null>(null);

    // Selection State
    const [selectionStart, setSelectionStart] = useState<{ col: number, row: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{ col: number, row: number } | null>(null);

    // Real-time clock
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);

        // Initial Fetch
        useCalendarStore.getState().fetchData();

        return () => clearInterval(timer);
    }, []);

    // Creation State
    const [newLabelName, setNewLabelName] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('#10B981');


    // Story State
    const [viewingStoryId, setViewingStoryId] = useState<string | null>(null);
    const [newStoryTitle, setNewStoryTitle] = useState('');
    const [newStoryDesc, setNewStoryDesc] = useState('');

    // Default to today
    const [newStoryDay, setNewStoryDay] = useState(() => {
        const d = new Date().getDay();
        return d === 0 ? 6 : d - 1;
    });

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
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    // Auto-open pending stories
    useEffect(() => {
        const jsDay = now.getDay();
        const appDay = jsDay === 0 ? 6 : jsDay - 1;
        const h = now.getHours();
        const m = now.getMinutes();

        const storyToOpen = stories.find(s =>
            s.status === 'pending' &&
            s.dayIndex === appDay &&
            s.hour === h &&
            s.minute === m
        );

        if (storyToOpen) {
            setViewingStoryId(storyToOpen.id);
            updateStory(storyToOpen.id, { status: 'triggered' });
        }
    }, [now, stories, updateStory]);

    const handleAddLabel = () => {
        if (newLabelName.trim()) {
            addLabel(newLabelName.trim(), newLabelColor);
            setNewLabelName('');
        }
    };

    // Drag Logic
    const handleMouseDown = (col: number, row: number) => {
        // If Locked, allow "Viewing" of the cell's label content (Read Only Access)
        if (isLocked) {
            const key = `${col}-${row}`;
            const labelId = schedule[key];
            if (labelId) {
                setEditingLabelId(labelId);
                setEditingCellKey(key);
            }
            return;
        }

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
        if (confirmModal) return; // Prevent double-trigger if modal is open

        if (isLocked) {
            setSelectionStart(null);
            setSelectionEnd(null);
            return;
        }

        if (selectionStart && selectionEnd) {
            // Use local copies for the async closure
            const start = { ...selectionStart };
            const end = { ...selectionEnd };
            const brush = selectedBrush;

            // ALERT: We do NOT clear selection here. We want the overlay to remain visible
            // while the confirm dialog is open, so the user knows what they are deleting.
            // setSelectionStart(null); // REMOVED

            setTimeout(() => {
                const minCol = Math.min(start.col, end.col);
                const maxCol = Math.max(start.col, end.col);
                const minRow = Math.min(start.row, end.row);
                const maxRow = Math.max(start.row, end.row);

                const isSingleCell = minCol === maxCol && minRow === maxRow;
                let labelToApply: string | null = brush;

                if (isSingleCell) {
                    const key = `${minCol}-${minRow}`;
                    const currentLabel = schedule[key];
                    if (currentLabel === brush) {
                        // Check logic before erasing
                        if (instanceNotes[key] && instanceNotes[key].trim().length > 0) {
                            setConfirmModal({
                                message: t('confirmClear'),
                                onConfirm: () => {
                                    // User Confirmed: Erase and Clear Selection
                                    setCellsBatch([{ day: minCol, slot: minRow }], null);
                                    setSelectionStart(null);
                                    setSelectionEnd(null);
                                },
                                onCancel: () => {
                                    // User Cancelled: Just Clear Selection
                                    setSelectionStart(null);
                                    setSelectionEnd(null);
                                }
                            });
                            return; // STOP execution here. Wait for modal.
                        }
                        labelToApply = null; // Toggle off
                    }
                }

                const cellsToUpdate = [];
                for (let c = minCol; c <= maxCol; c++) {
                    for (let r = minRow; r <= maxRow; r++) {
                        const key = `${c}-${r}`;
                        const currentLabel = schedule[key];

                        if (!isSingleCell && labelToApply !== null) {
                            if (currentLabel && currentLabel !== brush) {
                                continue;
                            }
                        }

                        cellsToUpdate.push({ day: c, slot: r });
                    }
                }

                if (cellsToUpdate.length > 0) {
                    setCellsBatch(cellsToUpdate, labelToApply);
                }

                // Cleanup selection finally
                setSelectionStart(null);
                setSelectionEnd(null);

            }, 20); // Small delay to allow browser repaint of selection overlay
        } else {
            setSelectionStart(null);
            setSelectionEnd(null);
        }
    };

    // Attach global mouseup
    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [selectionStart, selectionEnd, selectedBrush, schedule, isLocked, instanceNotes, confirmModal]);


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

    // Derived current day index (0=Mon, 6=Sun)
    const jsDay = now.getDay();
    const appDay = jsDay === 0 ? 6 : jsDay - 1;

    const handleConfigChange = (key: keyof typeof config, value: string) => {
        const num = parseInt(value);
        if (!isNaN(num)) setConfig({ [key]: num });
    };

    // Auto-scroll to current time on mount
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (isTimeVisible && containerRef.current) {
            // Need a small delay to ensure layout is settled or just calculate directly
            const scrollHeight = containerRef.current.scrollHeight;
            const clientHeight = containerRef.current.clientHeight;

            // Percentage 0-100. Target top is approx percentage of scrollHeight
            // Adjust for the 36px header offset in calculation if strict, but simple percentage is usually close enough for "viewing"
            // The arrow is at: 36px + (100% - 36px) * percentage
            // We want to center that Y position.

            // Let's refine based on the Arrow's top calculation which is exact:
            // top = 36 + (height - 36) * percentage
            // But 'height' in CSS 100% refers to the container height? 
            // In the grid, the table height drives the scrollHeight. 
            // The glass-panel (inside scroll) wraps the table. 
            // So we can assume scrollHeight ~ 100%.

            const targetY = 36 + (scrollHeight - 36) * (percentage / 100);
            const centerOffset = targetY - (clientHeight / 2);

            containerRef.current.scrollTo({
                top: centerOffset,
                behavior: 'smooth'
            });
        }
    }, []); // Run ONCE on mount

    // Get brush color object for preview
    const activeBrushObj = labels.find(l => l.id === selectedBrush);
    const editingLabel = labels.find(l => l.id === editingLabelId);
    const viewingStory = stories.find(s => s.id === viewingStoryId);

    return (
        <div className="flex flex-col h-screen w-full relative bg-slate-950/20 overflow-hidden">
            {useCalendarStore(state => state.isLoading) && (
                <div className="absolute inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-500">
                    <div className="w-8 h-8 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                    <p className="text-emerald-500 font-mono text-xs uppercase tracking-widest animate-pulse">{t('syncing')}</p>
                </div>
            )}

            {/* --- TOP PANEL: LABELS --- */}
            <div
                className={clsx(
                    "flex-none bg-slate-950/95 backdrop-blur-xl border-b border-slate-800 transition-all duration-300 ease-in-out z-40",
                    !isLocked ? "h-auto opacity-100 py-1" : "max-h-0 opacity-0 py-0 overflow-hidden"
                )}
            >
                <div className="container mx-auto px-2">
                    <div className="flex flex-col md:flex-row gap-2 items-center">
                        {/* Label Creator */}
                        <div className="flex-none flex items-center gap-2">
                            <div className="flex bg-slate-900 border border-slate-800 rounded p-1 w-48 shadow-inner items-center">
                                <span className="w-3 h-3 rounded ml-1 mr-1 shadow-sm" style={{ backgroundColor: newLabelColor }} />
                                <input
                                    type="text"
                                    placeholder={t('newLabel')}
                                    className="flex-1 bg-transparent border-none text-[10px] outline-none px-1 text-slate-200 placeholder:text-slate-600 min-w-0"
                                    value={newLabelName}
                                    onChange={(e) => setNewLabelName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
                                />
                                <input type="color" className="w-0 h-0 opacity-0 absolute" id="colorPicker" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} />
                                <label htmlFor="colorPicker" className="cursor-pointer text-slate-500 hover:text-white px-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.048 4.025a3 3 0 0 1-4.24-4.24m4.24 4.24.004-.004m-5.895-3.085a15.999 15.999 0 0 1-2.454.49" /></svg>
                                </label>
                                <button onClick={handleAddLabel} className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-500 hover:text-white p-0.5 rounded transition-all">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Label List */}
                        <div className="flex-1 flex flex-wrap gap-1.5 items-center overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                            {labels.map(lbl => (
                                <div
                                    key={lbl.id}
                                    onClick={() => setSelectedBrush(lbl.id)}
                                    className={clsx(
                                        "px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1.5 transition-all cursor-pointer group select-none hover:bg-slate-800/50 whitespace-nowrap",
                                        selectedBrush === lbl.id ? "ring-1 ring-offset-1 ring-offset-slate-950 scale-105" : "opacity-80 hover:opacity-100"
                                    )}
                                    style={{
                                        backgroundColor: `${lbl.color}10`,
                                        borderColor: lbl.color,
                                        color: lbl.color
                                    }}
                                >
                                    <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]" style={{ backgroundColor: lbl.color }} />
                                    <span className="max-w-[80px] truncate">{lbl.name}</span>

                                    <button
                                        className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity px-0.5"
                                        onClick={(e) => { e.stopPropagation(); setEditingLabelId(lbl.id); setActiveTab('global'); }}
                                        title={t('notes')}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5"><path d="m2.695 14.762-1.262 3.155a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.886L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" /></svg>
                                    </button>

                                    <span
                                        className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-colors px-0.5 cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // ... existing delete logic ...
                                            const hasGlobalNotes = lbl.notes && lbl.notes.trim().length > 0;
                                            const hasTabContent = Object.values(lbl.customTabs || {}).some(tab => tab.content && tab.content.trim().length > 0);
                                            const hasInstanceNotes = Object.entries(schedule).some(([key, labelId]) => {
                                                if (labelId !== lbl.id) return false;
                                                return instanceNotes[key] && instanceNotes[key].trim().length > 0;
                                            });

                                            if (hasGlobalNotes || hasTabContent || hasInstanceNotes) {
                                                setConfirmModal({
                                                    message: t('deleteLabel'),
                                                    onConfirm: () => removeLabel(lbl.id)
                                                });
                                            } else {
                                                removeLabel(lbl.id);
                                            }
                                        }}
                                    >×</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- MIDDLE: CALENDAR --- */}
            <main className="flex-1 relative overflow-hidden flex flex-col min-h-0">
                {/* Header inside Main (Always Visible) */}
                <div className="flex-none p-4 flex justify-between items-center z-30 bg-gradient-to-b from-slate-950/50 to-transparent">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-black text-white tracking-tighter drop-shadow-lg">
                            <span className="text-emerald-500">{t('appTitle')}</span> {t('planner')}
                        </h1>


                    </div>
                    <div className="flex items-center gap-4">
                        <div className="px-4 py-1.5 rounded-xl bg-slate-900/50 border border-slate-800/50 font-mono text-emerald-400 font-bold text-sm backdrop-blur">
                            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        <button
                            onClick={handleLogout}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all hover:scale-105 active:scale-95"
                            title={t('logout')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M16.5 3.75a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5V15a.75.75 0 0 0-1.5 0v3.75a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V5.25a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3V9A.75.75 0 1 0 9 9V5.25a1.5 1.5 0 0 1 1.5-1.5h6ZM5.78 8.47a.75.75 0 0 0-1.06 0l-3 3a.75.75 0 0 0 0 1.06l3 3a.75.75 0 0 0 1.06-1.06l-1.72-1.72H15a.75.75 0 0 0 0-1.5H4.06l1.72-1.72a.75.75 0 0 0 0-1.06Z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Grid */}
                <div ref={containerRef} className="flex-1 overflow-auto p-4 pt-0 custom-scrollbar">
                    <div className={clsx("glass-panel p-1 relative select-none transition-all duration-500 mx-auto w-full max-w-none mb-16")}>
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
                                        <th className="py-2 px-2 text-center w-14 text-slate-500 font-mono text-[10px] bg-slate-900/50 backdrop-blur border-b border-slate-700">{t('time')}</th>
                                        {DAYS.map((day, index) => (
                                            <th key={day} className={clsx(
                                                "py-1 px-1 text-center font-normal text-sm tracking-tighter border-b backdrop-blur transition-colors",
                                                index === appDay
                                                    ? "text-emerald-400 bg-emerald-500/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                                                    : "text-slate-300 border-slate-700 bg-slate-900/50"
                                            )}>{day}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {slots.map((slot, rowIndex) => (
                                        <tr key={rowIndex} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors h-8">
                                            <td className="py-2 px-1 text-center text-slate-600 font-mono text-[10px] border-r border-slate-800/50 relative group/time">
                                                {slot.label}
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
                                                        className={clsx(
                                                            "p-0 border-r border-slate-800/30 relative h-8 cursor-pointer group transition-colors",
                                                            colIndex === appDay && "bg-emerald-500/10 border-x border-emerald-500/20"
                                                        )}
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
                                                                <span className="text-[11px] font-normal tracking-tighter opacity-100 truncate px-1 flex-1 leading-tight select-none" style={{ color: labelObj.color }}>
                                                                    {labelObj.name}
                                                                </span>

                                                                {!isLocked && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setEditingLabelId(labelObj.id); setEditingCellKey(cellKey); setActiveTab('instance'); }}
                                                                        onMouseDown={(e) => e.stopPropagation()}
                                                                        className="mr-1 p-0.5 rounded hover:bg-black/20 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                                                        title={t('notes')}
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                                            <path d="m2.695 14.762-1.262 3.155a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.886L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.419a4 4 0 0 0-.885 1.343Z" />
                                                                        </svg>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Stories Layer - Relocated */}
                                                        {stories.filter(s => {
                                                            const storyMinutes = s.hour * 60 + s.minute;
                                                            return s.dayIndex === colIndex && storyMinutes >= slot.totalMinutes && storyMinutes < slot.totalMinutes + config.stepMinutes;
                                                        }).map(story => (
                                                            <div
                                                                key={story.id}
                                                                className={clsx(
                                                                    "absolute top-1/2 -translate-y-1/2 right-7 w-3 h-3 rounded-full bg-red-500 cursor-pointer shadow-[0_0_5px_rgba(239,68,68,0.8)] hover:scale-150 transition-transform z-20",
                                                                    (story.status === 'pending' || story.status === 'triggered') && "animate-pulse"
                                                                )}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setViewingStoryId(story.id);
                                                                    if (story.status === 'pending') {
                                                                        updateStory(story.id, { status: 'triggered' });
                                                                    }
                                                                }}
                                                            />
                                                        ))}

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

            {/* --- BOTTOM PANEL: CONFIG & STORIES --- */}
            <div className={clsx(
                "flex-none bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 transition-all duration-300 ease-in-out relative z-40",
                !isLocked ? "py-2" : "py-0"
            )}>
                {/* Toggle Handle (Absolute Top Center) */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full z-50">
                    <button
                        onClick={toggleLock}
                        className={clsx(
                            "flex items-center justify-center w-16 h-8 rounded-t-xl border-t border-x border-slate-700 backdrop-blur-md transition-all duration-300 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]",
                            !isLocked
                                ? "bg-slate-950 text-slate-400 border-b-slate-950 translate-y-[1px]"
                                : "bg-slate-900/80 text-emerald-500 hover:text-emerald-400 hover:bg-slate-800 border-b-slate-800"
                        )}
                        title={!isLocked ? t('settingsClose') : t('settingsOpen')}
                    >
                        {!isLocked ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                        ) : (
                            <div className="flex flex-col items-center gap-0.5 animate-pulse">
                                <div className="w-8 h-1 rounded-full bg-emerald-500/50" />
                                <div className="w-5 h-1 rounded-full bg-emerald-500/30" />
                            </div>
                        )}
                    </button>
                </div>

                {/* Wrapper for smooth height scaling */}
                <div className={clsx(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    !isLocked ? "h-auto opacity-100" : "max-h-0 opacity-0"
                )}>
                    <div className="container mx-auto px-4 flex flex-col items-center justify-center h-full pb-2">

                        {/* --- STATE: MENU (3 BUTTONS) --- */}
                        {activeBottomPanel === 'none' && (
                            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {/* 1. Config Button */}
                                <button
                                    onClick={() => setActiveBottomPanel('config')}
                                    className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-400 px-4 py-2 rounded-lg transition-all shadow-sm hover:shadow-emerald-500/10 group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 group-hover:rotate-90 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 0a20.87 20.87 0 0 0-1.439-4.283c-.266-.579.444-1.29 1.527.461l.657.38c.522.301.709.96.463 1.511a21.78 21.78 0 0 1-.985 2.783m2.406 5.231c.216.924.49 1.82.81 2.684.283.766.124 1.636-.453 2.115l-1.076.92c-.676.578-1.745.578-2.422 0l-1.076-.92c-.577-.479-.736-1.349-.453-2.115a20.24 20.24 0 0 1 .81-2.684m5.215-6.577c-.577.266-1.289-.444.461-1.527l.38-.657c.301-.522.96-.709 1.511-.463a21.77 21.77 0 0 1 2.783.985m-6.649.525c.577.266 1.289-.444.461-1.527l.38-.657c.301-.522.96-.709 1.511-.463a21.77 21.77 0 0 1 2.783.985" /></svg>
                                    <span className="text-sm font-medium">{t('sizeLayout')}</span>
                                </button>

                                {/* 2. Add Story Button */}
                                <button
                                    onClick={() => setActiveBottomPanel('story')}
                                    className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-blue-500/50 text-slate-400 hover:text-blue-400 px-4 py-2 rounded-lg transition-all shadow-sm hover:shadow-blue-500/10 group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 group-hover:scale-110 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                    <span className="text-sm font-medium">{t('addStory')}</span>
                                </button>

                                {/* 3. Clear Button */}
                                <button
                                    onClick={() => {
                                        if (confirm(t('confirmClear'))) clearSchedule();
                                    }}
                                    className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-red-500/50 text-slate-400 hover:text-red-400 px-4 py-2 rounded-lg transition-all shadow-sm hover:shadow-red-500/10 opacity-80 hover:opacity-100"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                    <span className="text-sm font-medium">{t('clear')}</span>
                                </button>
                            </div>
                        )}

                        {/* --- STATE: CONFIG --- */}
                        {activeBottomPanel === 'config' && (
                            <div className="flex-none flex items-center gap-4 bg-slate-900 border border-slate-800 rounded p-1.5 shadow-inner animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center gap-2">
                                    <div className="bg-emerald-500/10 p-1 rounded text-emerald-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 0a20.87 20.87 0 0 0-1.439-4.283c-.266-.579.444-1.29 1.527.461l.657.38c.522.301.709.96.463 1.511a21.78 21.78 0 0 1-.985 2.783m2.406 5.231c.216.924.49 1.82.81 2.684.283.766.124 1.636-.453 2.115l-1.076.92c-.676.578-1.745.578-2.422 0l-1.076-.92c-.577-.479-.736-1.349-.453-2.115a20.24 20.24 0 0 1 .81-2.684m5.215-6.577c.577.266 1.289-.444.461-1.527l.38-.657c.301-.522.96-.709 1.511-.463a21.77 21.77 0 0 1 2.783.985m-6.649.525c.577.266 1.289-.444.461-1.527l.38-.657c.301-.522.96-.709 1.511-.463a21.77 21.77 0 0 1 2.783.985" /></svg>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Range</span>
                                    <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1">
                                        <input type="number" min="0" max="23" className="w-5 bg-transparent text-center text-xs outline-none text-emerald-400" value={config.startHour} onChange={(e) => handleConfigChange('startHour', e.target.value)} />
                                        <span className="text-slate-600 text-xs">-</span>
                                        <input type="number" min="1" max="24" className="w-5 bg-transparent text-center text-xs outline-none text-emerald-400" value={config.endHour} onChange={(e) => handleConfigChange('endHour', e.target.value)} />
                                    </div>
                                </div>
                                <div className="w-px h-4 bg-slate-800" />
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Step</span>
                                    <select
                                        className="bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-xs text-emerald-400 outline-none cursor-pointer"
                                        value={config.stepMinutes}
                                        onChange={(e) => handleConfigChange('stepMinutes', e.target.value)}
                                    >
                                        <option value="10">10m</option>
                                        <option value="15">15m</option>
                                        <option value="20">20m</option>
                                        <option value="30">30m</option>
                                        <option value="60">60m</option>
                                    </select>
                                </div>
                                <button
                                    onClick={() => setActiveBottomPanel('none')}
                                    className="ml-2 text-slate-500 hover:text-white transition-colors"
                                    title="Close Config"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        )}

                        {/* --- STATE: STORY --- */}
                        {activeBottomPanel === 'story' && (
                            <div className="absolute bottom-16 md:bottom-20 z-50 flex flex-col gap-3 bg-slate-900/95 backdrop-blur-xl border border-slate-700 p-4 rounded-xl shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-10 fade-in duration-300 w-full max-w-sm mx-auto left-0 right-0">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                    <div className="flex items-center gap-2 text-blue-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                                        <span className="font-bold text-sm uppercase tracking-wide">{t('createStory')}</span>
                                    </div>
                                    <button onClick={() => setActiveBottomPanel('none')} className="text-slate-500 hover:text-white transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-slate-500">{t('title')}</label>
                                        <input
                                            type="text"
                                            placeholder={t('storyPlaceholder')}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 transition-colors shadow-inner"
                                            value={newStoryTitle}
                                            onChange={(e) => setNewStoryTitle(e.target.value)}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase font-bold text-slate-500">{t('day')}</label>
                                            <select
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-300 outline-none cursor-pointer focus:border-blue-500 transition-colors shadow-inner"
                                                value={newStoryDay}
                                                onChange={(e) => setNewStoryDay(Number(e.target.value))}
                                            >
                                                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase font-bold text-slate-500">{t('time')}</label>
                                            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 shadow-inner focus-within:border-blue-500 transition-colors">
                                                <input type="number" min="0" max="23" className="w-full bg-transparent text-center text-sm outline-none" value={newStoryHour} onChange={(e) => setNewStoryHour(Number(e.target.value))} />
                                                <span className="text-slate-500 font-bold">:</span>
                                                <input type="number" min="0" max="59" className="w-full bg-transparent text-center text-sm outline-none" value={newStoryMinute} onChange={(e) => setNewStoryMinute(Number(e.target.value))} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-slate-500">{t('description')}</label>
                                        <textarea
                                            className="w-full h-20 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none resize-none focus:border-blue-500 transition-colors shadow-inner scrollbar-thin scrollbar-thumb-slate-700"
                                            placeholder={t('storyDescPlaceholder')}
                                            value={newStoryDesc}
                                            onChange={(e) => setNewStoryDesc(e.target.value)}
                                        />
                                    </div>

                                    <div className="pt-2">
                                        <button
                                            onClick={() => { handleAddStory(); setActiveBottomPanel('none'); }}
                                            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-2 rounded-lg shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-sm"
                                        >
                                            {t('createStory')}
                                        </button>
                                    </div>
                                </div>
                            </div>

                        )}

                    </div>
                </div>
            </div>

            {/* Label Modal (Viewer vs Editor) */}
            {
                editingLabel && (
                    isLocked ? (
                        // VIEWING MODE (Simple Read-Only)
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                            onClick={() => { setEditingLabelId(null); setEditingCellKey(null); }}
                        >
                            <div
                                className="pointer-events-auto bg-slate-950 border border-slate-800 rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ring-1 ring-white/10"
                                style={{ borderColor: editingLabel.color }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                                    <h3 className="font-bold text-lg flex items-center gap-2 text-white">
                                        <span className="w-3 h-3 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: editingLabel.color }} />
                                        {editingLabel.name}
                                    </h3>
                                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider border border-slate-800 px-2 py-0.5 rounded-full">{t('readOnly')}</div>
                                </div>

                                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                    {/* Global Notes */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                            {t('globalGuidelines')}
                                        </label>
                                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 min-h-[80px]">
                                            <div
                                                className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-medium [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
                                                dangerouslySetInnerHTML={{ __html: editingLabel.notes || '<span class="text-slate-600 italic">No global guidelines set.</span>' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Instance Notes (if specific cell clicked) */}
                                    {editingCellKey && instanceNotes[editingCellKey] && (
                                        <div className="space-y-2 animate-in slide-in-from-bottom-2">
                                            <label className="text-xs font-bold text-blue-400 uppercase flex items-center gap-2">
                                                {t('specificNote')}
                                            </label>
                                            <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20 min-h-[60px]">
                                                <div
                                                    className="text-blue-100 text-sm leading-relaxed whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
                                                    dangerouslySetInnerHTML={{ __html: instanceNotes[editingCellKey] }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 border-t border-slate-800 bg-slate-900/30 flex justify-end">
                                    <Button size="sm" onClick={() => { setEditingLabelId(null); setEditingCellKey(null); }}>{t('close')}</Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                            <div
                                className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden"
                                style={{ boxShadow: `0 0 50px ${editingLabel.color}15` }}
                            >
                                {/* Header */}
                                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 flex-none">
                                    <h3 className="font-bold text-lg flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: editingLabel.color }} />
                                        {editingLabel.name} <span className="text-slate-500 font-normal text-sm">{t('notesManagement')}</span>
                                    </h3>
                                    <button onClick={() => { setEditingLabelId(null); setEditingCellKey(null); }} className="text-slate-400 hover:text-white transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                            <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Tab Navigation */}
                                <div className="flex border-b border-slate-800 bg-slate-950/30 px-4 pt-4 gap-2 items-center overflow-x-auto custom-scrollbar">
                                    <div className="flex gap-2 flex-1">
                                        {/* Render Dynamic Open Tabs */}
                                        {(editingLabel.openTabs || []).map(tabId => {
                                            // Special handling for visibility of 'instance' tab
                                            if (tabId === 'instance' && !editingCellKey) return null;

                                            let tabTitle = 'Unknown';
                                            if (tabId === 'global') tabTitle = t('globalConfig');
                                            if (tabId === 'instance') tabTitle = t('thisBlock');
                                            if (tabId.startsWith('tab-') && editingLabel.customTabs?.[tabId]) tabTitle = editingLabel.customTabs[tabId].title;

                                            const isActive = activeTab === tabId;

                                            // DnD Handlers
                                            const handleDragStart = (e: React.DragEvent) => {
                                                setDraggedTab(tabId);
                                                e.dataTransfer.effectAllowed = 'move';
                                            };

                                            const handleDragOver = (e: React.DragEvent) => {
                                                e.preventDefault();
                                                if (!draggedTab || draggedTab === tabId) return;
                                            };

                                            const handleDrop = (e: React.DragEvent) => {
                                                e.preventDefault();
                                                if (!draggedTab || draggedTab === tabId) return;

                                                const newOrder = [...(editingLabel.openTabs || [])];
                                                const fromIndex = newOrder.indexOf(draggedTab);
                                                const toIndex = newOrder.indexOf(tabId);

                                                if (fromIndex !== -1 && toIndex !== -1) {
                                                    newOrder.splice(fromIndex, 1);
                                                    newOrder.splice(toIndex, 0, draggedTab);
                                                    reorderTabs(editingLabel.id, newOrder);
                                                }
                                                setDraggedTab(null);
                                                e.dataTransfer.clearData();
                                            };

                                            // content checker for clear confirmation
                                            const handleTabClose = (e: React.MouseEvent) => {
                                                e.stopPropagation();

                                                let content = '';
                                                if (tabId === 'global') content = editingLabel.notes || '';
                                                if (tabId === 'instance' && editingCellKey) content = instanceNotes[editingCellKey] || '';
                                                if (tabId.startsWith('tab-') && editingLabel.customTabs?.[tabId]) content = editingLabel.customTabs[tabId].content;

                                                const hasContent = content.replace(/<[^>]*>/g, '').trim().length > 0;

                                                if (hasContent) {
                                                    if (!confirm(t('confirmCloseTab'))) {
                                                        return;
                                                    }
                                                }

                                                closeTab(editingLabel.id, tabId);
                                                // If we closed the active tab, switch to global (or first available)
                                                if (activeTab === tabId) setActiveTab('global');
                                            };

                                            return (
                                                <button
                                                    key={tabId}
                                                    draggable
                                                    onDragStart={handleDragStart}
                                                    onDragOver={handleDragOver}
                                                    onDrop={handleDrop}
                                                    onDragEnd={() => setDraggedTab(null)}
                                                    onClick={() => setActiveTab(tabId)}
                                                    className={clsx(
                                                        "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative flex items-center gap-2 group whitespace-nowrap cursor-pointer",
                                                        isActive ? "text-white bg-slate-900 border-x border-t border-slate-700" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50",
                                                        (draggedTab === tabId) ? "opacity-30" : "opacity-100"
                                                    )}
                                                >
                                                    {tabTitle}
                                                    <span
                                                        onClick={handleTabClose}
                                                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-700 rounded-full transition-all text-slate-400 hover:text-red-400"
                                                        title="Close Tab (Move to Trash)"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                                                    </span>
                                                    {isActive && <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-slate-900" />}
                                                </button>
                                            );
                                        })}

                                        {/* Add Tab Button */}
                                        {((editingLabel.openTabs?.length || 0) + (editingLabel.trashedTabs?.length || 0) < 7) && (
                                            <button
                                                onClick={() => addTab(editingLabel.id)}
                                                className="px-3 py-2 text-slate-500 hover:text-emerald-400 hover:bg-slate-800/50 rounded-t-lg transition-colors flex-none"
                                                title="Add New Tab"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>

                                    {/* Trash Toggle */}
                                    <button
                                        onClick={() => setShowTrash(!showTrash)}
                                        className={clsx("p-2 rounded-lg transition-colors relative", showTrash ? "text-red-400 bg-slate-800" : "text-slate-500 hover:text-slate-300")}
                                        title="Trash / Closed Tabs"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                        </svg>
                                        {(editingLabel.trashedTabs?.length || 0) > 0 && (
                                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold">
                                                {editingLabel.trashedTabs!.length}
                                            </span>
                                        )}
                                    </button>
                                </div>

                                {/* Trash Area */}
                                {showTrash && (
                                    <div className="bg-slate-900 border-b border-slate-800 p-4 animate-in slide-in-from-top-2 duration-200">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">{t('trash')}</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {(editingLabel.trashedTabs || []).length === 0 && <span className="text-slate-600 text-sm">{t('trashEmpty')}</span>}
                                            {(editingLabel.trashedTabs || []).map(tabId => {
                                                let title = tabId;
                                                let isProtected = false;

                                                if (tabId === 'global') { title = t('globalConfig'); isProtected = true; }
                                                else if (tabId === 'instance') title = t('thisBlock'); // instance usually shouldn't be trashed manually but if it is, it's not critical protected like global/daily? User said "except exception of global config and stories"
                                                else if (editingLabel.customTabs?.[tabId]) title = editingLabel.customTabs[tabId].title;

                                                return (
                                                    <div key={tabId} className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-300">
                                                        <span>{title}</span>
                                                        <button
                                                            onClick={() => restoreTab(editingLabel.id, tabId)}
                                                            className="text-emerald-400 hover:text-emerald-300 p-0.5 hover:bg-emerald-400/10 rounded"
                                                            title={t('restore')}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39z" clipRule="evenodd" /><path fillRule="evenodd" d="M13.485 1.431a.75.75 0 00-1.47 0 .75.75 0 001.47 0zM14 6.75a.75.75 0 00-1.5 0 .75.75 0 001.5 0zM16.5 4.75a.75.75 0 00-1.5 0 .75.75 0 001.5 0z" /></svg>
                                                        </button>

                                                        {!isProtected && (
                                                            <button
                                                                onClick={() => {
                                                                    if (confirm(t('confirmDeleteTab'))) {
                                                                        deleteTabForever(editingLabel.id, tabId);
                                                                    }
                                                                }}
                                                                className="text-red-400 hover:text-red-300 p-0.5 hover:bg-red-400/10 rounded"
                                                                title={t('deleteForever')}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Content Area */}
                                <div className="flex-1 p-6 bg-slate-900/50 overflow-y-auto custom-scrollbar">
                                    {activeTab === 'global' && (
                                        <div className="animate-in fade-in duration-200">
                                            <WordEditor
                                                label={t('globalConfig')}
                                                subLabel={`Notes for all "${editingLabel.name}" blocks`}
                                                color="#10B981" // Emerald
                                                value={editingLabel.notes || ''}
                                                onChange={(val) => updateLabelNotes(editingLabel.id, val)}
                                                placeholder={`General guidelines for ${editingLabel.name}...`}
                                            />
                                        </div>
                                    )}

                                    {activeTab === 'instance' && (
                                        <div className="animate-in fade-in duration-200">
                                            <WordEditor
                                                label={t('thisSpecificBlock')}
                                                subLabel={editingCellKey ? "Notes for just this specific time slot" : "Select a specific block on the grid to filter"}
                                                color="#3B82F6" // Blue
                                                value={editingCellKey ? (instanceNotes[editingCellKey] || '') : ''}
                                                onChange={(val) => editingCellKey && updateInstanceNote(editingCellKey, val)}
                                                placeholder={editingCellKey ? "Specific task details..." : "(Disabled - Open from grid)"}
                                                disabled={!editingCellKey}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex justify-end">
                                    <Button onClick={() => { setEditingLabelId(null); setEditingCellKey(null); }}>{t('closeSave')}</Button>
                                    {/* Render Custom Tabs */}
                                    {activeTab.startsWith('tab-') && editingLabel.customTabs?.[activeTab] && (
                                        <div className="animate-in fade-in duration-200">
                                            <WordEditor
                                                key={activeTab}
                                                label={editingLabel.customTabs[activeTab].title}
                                                subLabel={t('customNote')}
                                                color="#8B5CF6" // Violet
                                                value={editingLabel.customTabs[activeTab].content}
                                                onChange={(val) => updateCustomTab(editingLabel.id, activeTab, val)}
                                                placeholder={t('writeNotes')}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                )
            }

            {/* Story Viewer Modal */}
            {
                viewingStory && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => {
                            setViewingStoryId(null);
                            if (viewingStory.status === 'triggered') {
                                updateStory(viewingStory.id, { status: 'viewed' });
                            }
                        }}
                    >
                        <div
                            className="pointer-events-auto bg-slate-950 border border-red-500/50 rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ring-1 ring-red-900/50"
                            onClick={(e) => e.stopPropagation()}
                        >
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
                                            <Button size="sm" onClick={() => {
                                                setViewingStoryId(null);
                                                if (viewingStory.status === 'triggered') {
                                                    updateStory(viewingStory.id, { status: 'viewed' });
                                                }
                                            }}>Done</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 min-h-[120px] flex items-center">
                                            <p className="text-white text-base leading-relaxed whitespace-pre-wrap font-medium w-full">
                                                {viewingStory.content || <span className="text-slate-500 italic">No details provided for this story.</span>}
                                            </p>
                                        </div>
                                        <div className="flex justify-end pt-2">
                                            <Button size="sm" variant="danger" onClick={() => {
                                                setViewingStoryId(null);
                                                if (viewingStory.status === 'triggered') {
                                                    updateStory(viewingStory.id, { status: 'viewed' });
                                                }
                                            }}>Close</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Confirmation Modal */}
            {
                confirmModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-6 space-y-4">
                                <div className="flex items-center gap-3 text-amber-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                                        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                                    </svg>
                                    <h3 className="text-lg font-bold text-white">{t('confirmAction')}</h3>
                                </div>
                                <p className="text-slate-300 text-sm leading-relaxed">
                                    {confirmModal.message}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        if (confirmModal.onCancel) confirmModal.onCancel();
                                        setConfirmModal(null);
                                    }}
                                >
                                    {t('cancel')}
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => {
                                        confirmModal.onConfirm();
                                        setConfirmModal(null);
                                    }}
                                >
                                    {t('yesDelete')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
