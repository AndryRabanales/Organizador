import clsx from 'clsx';
import { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: Props) {
    return (
        <button
            className={clsx(
                "relative overflow-hidden font-mono font-medium rounded-lg transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 border",
                {
                    // Sizes
                    "px-3 py-1.5 text-xs": size === 'sm',
                    "px-4 py-2 text-sm": size === 'md',
                    "px-6 py-3 text-base": size === 'lg',

                    // Variants
                    "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30 hover:border-emerald-400 focus:ring-emerald-500": variant === 'primary',
                    "bg-slate-700/40 text-slate-300 border-slate-600/50 hover:bg-slate-700/60 hover:border-slate-500 focus:ring-slate-500": variant === 'secondary',
                    "bg-red-500/20 text-red-300 border-red-500/50 hover:bg-red-500/30 hover:border-red-400 focus:ring-red-500": variant === 'danger',
                    "bg-transparent text-slate-400 border-transparent hover:text-white hover:bg-slate-800/50": variant === 'ghost',
                },
                className
            )}
            {...props}
        />
    );
}
