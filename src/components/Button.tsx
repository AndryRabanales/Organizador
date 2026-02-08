import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: Props) {
    return (
        <button
            className={clsx(
                "relative overflow-hidden font-mono font-medium rounded-lg transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white border",
                {
                    // Sizes
                    "px-3 py-1.5 text-xs": size === 'sm',
                    "px-4 py-2 text-sm": size === 'md',
                    "px-6 py-3 text-base": size === 'lg',

                    // Variants
                    "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 hover:border-emerald-300 focus:ring-emerald-500": variant === 'primary',
                    "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 hover:border-slate-300 focus:ring-slate-400": variant === 'secondary',
                    "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300 focus:ring-red-500": variant === 'danger',
                    "bg-transparent text-slate-500 border-transparent hover:text-slate-900 hover:bg-slate-100": variant === 'ghost',
                },
                className
            )}
            {...props}
        />
    );
}
