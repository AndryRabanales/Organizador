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

    // Sync external value to innerHTML only if different (prevents cursor jumping)
    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            // Check if it's just a trivial difference (like extra <br>) or real
            // For simplicity in this app, we trust the value if it's not the same.
            // But we must be careful not to overwrite typing.
            // Since this is a local app, `value` only changes if we type or switch cells.
            // If we switch cells, the component might re-mount or props change.
            // If we are typing, onChange updates `value`, which comes back here.
            // To be safe, we only set it if the editor is NOT focused, OR if the data is completely different (different cell).
            // Actually, comparing innerHTML is usually enough.
            if (document.activeElement !== editorRef.current) {
                editorRef.current.innerHTML = value;
            } else if (value === '' && editorRef.current.innerHTML === '<br>') {
                // Handle clear
                editorRef.current.innerHTML = '';
            }
        }
    }, [value]);

    const execCmd = (command: string, value: string | undefined = undefined) => {
        if (disabled) return;
        document.execCommand(command, false, value);
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
            // Ensure focus remains or returns to editor
            if (document.activeElement !== editorRef.current) {
                editorRef.current.focus();
            }
        }
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        onChange(target.innerHTML);
    };

    return (
        <div className={clsx("flex flex-col border border-slate-700 bg-slate-900 rounded-lg overflow-hidden shadow-lg transition-opacity duration-300", disabled && "opacity-60 pointer-events-none")}>
            {/* Header / Toolbar Combined */}
            <div className="bg-slate-900 text-slate-300 px-3 py-2 flex flex-col gap-2 border-b border-slate-800">
                <div className="flex justify-between items-center">
                    <span className="font-bold flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.3)]" style={{ backgroundColor: color }} />
                        {label}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono tracking-tight">{subLabel}</span>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-1">
                    <div className="flex items-center bg-slate-950/50 rounded-md p-0.5 border border-slate-700/50">
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('bold'); }} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white font-bold w-7 h-7 flex items-center justify-center text-xs transition-colors" title="Bold">B</button>
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('italic'); }} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white italic w-7 h-7 flex items-center justify-center text-xs font-serif transition-colors" title="Italic">I</button>
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('underline'); }} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white underline w-7 h-7 flex items-center justify-center text-xs transition-colors" title="Underline">U</button>
                    </div>

                    <div className="w-px h-4 bg-slate-800 mx-1" />

                    <div className="flex items-center bg-slate-950/50 rounded-md p-0.5 border border-slate-700/50">
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('insertUnorderedList'); }} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white w-7 h-7 flex items-center justify-center transition-colors" title="Bullets">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>
                        </button>
                        <button onMouseDown={(e) => { e.preventDefault(); execCmd('insertOrderedList'); }} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white w-7 h-7 flex items-center justify-center font-mono text-xs transition-colors" title="Numbering">1.</button>
                    </div>
                </div>
            </div>

            {/* Editor Area (ContentEditable) */}
            <div className="flex-1 bg-slate-950 relative min-h-[200px] cursor-text" onClick={() => editorRef.current?.focus()}>
                <div
                    ref={editorRef}
                    className="w-full h-full p-4 text-slate-300 bg-slate-950 focus:outline-none resize-none font-sans leading-relaxed custom-scrollbar text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                    contentEditable={!disabled}
                    onInput={handleInput}
                    onBlur={handleInput}
                    suppressContentEditableWarning={true}
                    style={{ minHeight: '300px' }}
                />
                {!value && placeholder && (
                    <div className="absolute top-4 left-4 text-slate-600 pointer-events-none text-sm select-none">
                        {placeholder}
                    </div>
                )}
            </div>

            {/* Minimal Status Bar */}
            <div className="bg-slate-900 border-t border-slate-800 text-slate-600 px-3 py-1 text-[10px] flex justify-end font-mono">
                <span>{value.length} chars (HTML)</span>
            </div>
        </div>
    );
}
