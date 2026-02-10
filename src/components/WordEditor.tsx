import clsx from 'clsx';
import { useRef, useEffect } from 'react';

interface WordEditorProps {
    label: string;
    subLabel?: string;
    value: string;
    onChange: (val: string) => void;
    color: string;
    placeholder?: string;
    disabled?: boolean;
}

export function WordEditor({ label, subLabel, value, onChange, color, placeholder, disabled }: WordEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastEmittedValue = useRef(value);

    // Sync external value to innerHTML
    useEffect(() => {
        if (editorRef.current && value !== lastEmittedValue.current) {
            if (document.activeElement !== editorRef.current) {
                editorRef.current.innerHTML = value;
                lastEmittedValue.current = value;
            }
        } else if (editorRef.current && value === '' && editorRef.current.innerHTML === '<br>') {
            editorRef.current.innerHTML = '';
        }
    }, [value]);

    const emitChange = (newValue: string) => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        lastEmittedValue.current = newValue;
        onChange(newValue);
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        const val = e.currentTarget.innerHTML;

        // Clear existing timer
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        // Set new timer
        debounceTimer.current = setTimeout(() => {
            emitChange(val);
        }, 1000); // 1 second debounce
    };

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        // Flush immediately on blur
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        const val = e.currentTarget.innerHTML;
        emitChange(val);
    };

    const execCmd = (command: string, value: string | undefined = undefined) => {
        if (disabled) return;
        document.execCommand(command, false, value);
        if (editorRef.current) {
            const val = editorRef.current.innerHTML;
            editorRef.current.focus();
            emitChange(val); // Commands apply immediately
        }
    };

    return (
        <div className={clsx("flex flex-col border border-slate-200 bg-white rounded-lg overflow-hidden shadow-lg transition-opacity duration-300", disabled && "opacity-60 pointer-events-none")}>
            {/* Header / Toolbar Combined */}
            <div className="bg-slate-50 text-slate-700 px-3 py-2 flex flex-col gap-2 border-b border-slate-200">
                <div className="flex justify-between items-center">
                    <span className="font-bold flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: color }} />
                        {label}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono tracking-tight">{subLabel}</span>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-1">
                    <div className="flex items-center bg-white rounded-md p-0.5 border border-slate-200">
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('bold'); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 font-bold w-7 h-7 flex items-center justify-center text-xs transition-colors" title="Bold">B</button>
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('italic'); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 italic w-7 h-7 flex items-center justify-center text-xs font-serif transition-colors" title="Italic">I</button>
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('underline'); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 underline w-7 h-7 flex items-center justify-center text-xs transition-colors" title="Underline">U</button>
                    </div>

                    <div className="w-px h-4 bg-slate-200 mx-1" />

                    <div className="flex items-center bg-white rounded-md p-0.5 border border-slate-200">
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('insertUnorderedList'); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 w-7 h-7 flex items-center justify-center transition-colors" title="Bullets">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>
                        </button>
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('insertOrderedList'); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 w-7 h-7 flex items-center justify-center font-mono text-xs transition-colors" title="Numbering">1.</button>
                    </div>
                </div>
            </div>

            {/* Editor Area (ContentEditable) */}
            <div className="flex-1 bg-white relative min-h-[200px] cursor-text" onClick={() => editorRef.current?.focus()}>
                <div
                    ref={editorRef}
                    className="w-full h-full p-4 text-slate-700 bg-white focus:outline-none resize-none font-sans leading-relaxed custom-scrollbar text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                    contentEditable={!disabled}
                    onInput={handleInput}
                    onBlur={handleBlur}
                    suppressContentEditableWarning={true}
                    style={{ minHeight: '300px' }}
                />
                {!value && placeholder && (
                    <div className="absolute top-4 left-4 text-slate-400 pointer-events-none text-sm select-none">
                        {placeholder}
                    </div>
                )}
            </div>

            {/* Minimal Status Bar */}
            <div className="bg-slate-50 border-t border-slate-200 text-slate-500 px-3 py-1 text-[10px] flex justify-end font-mono">
                <span>{value.length} chars (HTML)</span>
            </div>
        </div>
    );
}
