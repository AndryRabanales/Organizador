/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'bio-green': '#10B981',   // Health/Integrity
                'bio-orange': '#F59E0B',  // Warning
                'bio-red': '#EF4444',     // Critical
                'bio-blue': '#3B82F6',    // Shield
                'bio-dark': '#0f172a',    // Background
            },
            fontFamily: {
                'mono': ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
            },
        },
    },
    plugins: [],
}
