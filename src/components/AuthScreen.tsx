import { useState } from 'react';
import { supabase } from '../lib/supabase';
import clsx from 'clsx';
import { useLanguage } from '../hooks/useLanguage';

export function AuthScreen() {
    const { t } = useLanguage();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                    redirectTo: import.meta.env.PROD
                        ? 'https://gympartner-production.up.railway.app'
                        : window.location.origin,
                },
            });

            if (error) {
                throw error;
            }
            // Redirect happens automatically
        } catch (err: any) {
            console.error("Login Error:", err);
            setError(err.message || 'Failed to login with Google.');
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 min-h-screen w-full overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-slate-50 to-slate-100 flex items-center justify-center p-4">

            {/* Background Ambient Glow */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '7s' }} />

            {/* Glass Card */}
            <div className="relative z-10 w-full max-w-md bg-white/80 backdrop-blur-xl border border-white/50 rounded-2xl shadow-2xl p-8 flex flex-col items-center animate-in zoom-in-95 slide-in-from-bottom-8 duration-700 fade-in">

                {/* Logo / Title Area */}
                <div className="mb-8 text-center space-y-2">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-indigo-600 rounded-2xl mx-auto shadow-lg shadow-emerald-500/20 flex items-center justify-center mb-6 animate-bounce" style={{ animationDuration: '3s' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white">
                            <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 0 1 7.5 3v1.5h9V3A.75.75 0 0 1 18 3v1.5h.75a3 3 0 0 1 3 3v11.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3H6V3a.75.75 0 0 1 .75-.75Zm13.5 9a1.5 1.5 0 0 0-1.5-1.5H5.25a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5v-7.5Z" clipRule="evenodd" />
                        </svg>
                    </div>

                    <h1 className="text-3xl font-black text-slate-900 tracking-widest drop-shadow-sm">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-emerald-400">{t('appTitle')}</span> {t('planner')}
                    </h1>
                    <p className="text-slate-500 text-sm font-medium tracking-wide font-mono">
                        {t('subtitle')}
                    </p>
                </div>

                {/* Login Button */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className={clsx(
                        "group relative w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl transition-all duration-300",
                        "bg-slate-900 text-white font-bold text-lg hover:bg-slate-800 hover:scale-[1.02] active:scale-[0.98]",
                        "disabled:opacity-70 disabled:cursor-not-allowed",
                        "shadow-[0_0_20px_-5px_rgba(0,0,0,0.1)] hover:shadow-[0_0_30px_-5px_rgba(0,0,0,0.2)]"
                    )}
                >
                    {/* Google Icon */}
                    {isLoading ? (
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                    )}

                    {isLoading ? t('connecting') : t('continueGoogle')}
                </button>

                {/* Secure Badge */}
                <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400 font-mono opacity-60">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                    </svg>
                    <span>{t('secureBadge')}</span>
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg w-full text-center animate-pulse">
                        {error}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="absolute bottom-6 w-full text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                    &copy; 2026 {t('copyright')}
                </p>
            </div>
        </div>
    );
}
