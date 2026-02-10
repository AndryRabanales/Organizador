import { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import clsx from 'clsx';

interface AIPromptBoxProps {
    isOpen: boolean;
    onClose: () => void;
    onExecute: (prompt: string) => Promise<void>;
    isProcessing: boolean;
}

export function AIPromptBox({ isOpen, onClose, onExecute, isProcessing }: AIPromptBoxProps) {
    const [prompt, setPrompt] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!prompt.trim() || isProcessing) return;
        await onExecute(prompt);
        setPrompt(''); // Clear on success
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white/90 backdrop-blur-xl border border-white/50 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden ring-1 ring-black/5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 flex justify-between items-center text-white">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">✨</span>
                        <h2 className="font-bold text-sm tracking-wide uppercase">AI Director</h2>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    <div className="relative">
                        <textarea
                            ref={inputRef}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                            placeholder="Describe what you want to change... (e.g., 'Set work hours 9-5 and add lunch at 1pm')"
                            className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all resize-none shadow-inner text-sm leading-relaxed"
                            disabled={isProcessing}
                        />
                        {isProcessing && (
                            <div className="absolute inset-0 bg-white/50 flex items-center justify-center backdrop-blur-[1px] rounded-xl">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-xs font-bold text-violet-600 animate-pulse">Thinking...</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-400">
                        <span>Press Enter to execute</span>
                        <div className="flex gap-2">
                            <Button
                                onClick={onClose}
                                variant="secondary"
                                className="!py-1.5 !px-3"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={!prompt.trim() || isProcessing}
                                className={clsx(
                                    "!py-1.5 !px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/20",
                                    isProcessing && "opacity-70 cursor-not-allowed"
                                )}
                            >
                                {isProcessing ? 'Processing...' : 'Make it happen ✨'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
