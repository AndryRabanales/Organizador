import clsx from 'clsx';

interface Props {
    value: number; // 0-100
    max?: number;
    label?: string;
    colorClass?: string;
    showValue?: boolean;
    inverted?: boolean; // If true, 100% is full/bad (like pressure), false means 100% is good (health)
}

export function ProgressBar({
    value,
    max = 100,
    label,
    colorClass = "bg-bio-green",
    showValue = true,
    inverted = false
}: Props) {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));

    // Dynamic color logic if not overridden
    // For normal: Low is bad (red), High is good (green)
    // For inverted: Low is good (green), High is bad (red)

    return (
        <div className="w-full space-y-2">
            <div className="flex justify-between items-end">
                {label && <span className="text-xs font-mono uppercase tracking-widest text-slate-400">{label}</span>}
                {showValue && <span className="text-xs font-mono font-bold text-slate-200">{Math.round(value)}{inverted ? "%" : "%"}</span>}
            </div>

            <div className="bio-bar-container">
                <div
                    className={clsx("bio-bar-fill h-full", colorClass)}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
