'use client';

import React, { useEffect, useState } from 'react';
import { X, SunIcon, MoonIcon, CircleIcon } from 'lucide-react';
import { SWATCHES } from '@/constants/themes';

type ThemeMode = 'theme-dark' | 'theme-light' | 'theme-night';

const MODE_COOKIE = 'theme-mode';
const ACCENT_COOKIE = 'theme-accent';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;


function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}


export function applyThemeMode(mode: ThemeMode) {
    document.documentElement.className = mode;
}

export function applyAccentColor(hex: string) {
    document.documentElement.style.setProperty('--color-accent', hex);
}

/** Call once on page load to restore saved preferences. */
export function restoreThemeFromCookies() {
    const mode = (getCookie(MODE_COOKIE) as ThemeMode) || 'theme-dark';
    const accent = getCookie(ACCENT_COOKIE);
    applyThemeMode(mode);
    if (accent) applyAccentColor(accent);
    return { mode, accent };
}

interface ThemeModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentMode: ThemeMode;
    onModeChange: (mode: ThemeMode) => void;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({ isOpen, onClose, currentMode, onModeChange }) => {
    const [accentColor, setAccentColor] = useState<string>(() => getCookie(ACCENT_COOKIE) || '#9370DB');

    // Sync accent from cookie on open
    useEffect(() => {
        if (isOpen) {
            const saved = getCookie(ACCENT_COOKIE);
            if (saved) setAccentColor(saved);
        }
    }, [isOpen]);

    // Lock scroll when modal is open
    useEffect(() => {
        const root = document.documentElement;
        isOpen ? root.classList.add('lock-scroll') : root.classList.remove('lock-scroll');
        return () => root.classList.remove('lock-scroll');
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    const handleModeSelect = (mode: ThemeMode) => {
        applyThemeMode(mode);
        setCookie(MODE_COOKIE, mode);
        onModeChange(mode);
    };

    const handleSwatchClick = (hex: string) => {
        applyAccentColor(hex);
        setCookie(ACCENT_COOKIE, hex);
        setAccentColor(hex);
    };

    if (!isOpen) return null;

    const modes: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
        { id: 'theme-light', label: 'Light', icon: <SunIcon className="size-5" /> },
        { id: 'theme-dark', label: 'Dark', icon: <MoonIcon className="size-5" /> },
        { id: 'theme-night', label: 'Night', icon: <CircleIcon className="size-5 fill-current" /> },
    ];

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center">
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 bg-foreground border border-borders rounded-xl shadow-2xl w-[95%] max-w-sm animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between px-5 py-4 border-b border-borders">
                    <h2 className="text-lg font-semibold text-primary">Appearance</h2>
                    <button
                        onClick={onClose}
                        className="text-muted hover:text-primary transition-colors hover:bg-background rounded-full p-1 cursor-pointer"
                        aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-5 py-5 space-y-6">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Mode</p>
                        <div className="grid grid-cols-3 gap-2">
                            {modes.map(({ id, label, icon }) => {
                                const active = currentMode === id;
                                return (
                                    <button key={id} onClick={() => handleModeSelect(id)} className={`flex flex-col items-center gap-2 px-3 py-3 rounded-lg border text-sm font-medium transition-all cursor-pointer
                                        ${active
                                            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                                            : 'border-borders hover:border-[var(--color-accent)]/50 text-muted hover:text-primary'
                                        }`}
                                    >
                                        {icon}
                                        <span>{label}</span>
                                        <span className={`size-4 rounded border flex items-center justify-center transition-all ${active ? 'bg-[var(--color-accent)] border-[var(--color-accent)]' : 'border-borders'}`}>
                                            {active && (
                                                <svg className="size-3 text-white" viewBox="0 0 12 12" fill="none">
                                                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Color swatches */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Accent Color</p>
                        <div className="grid grid-cols-6 gap-2">
                            {SWATCHES.map((swatch) => {
                                const active = accentColor.toLowerCase() === swatch.value.toLowerCase();
                                return (
                                    <button key={swatch.value} onClick={() => handleSwatchClick(swatch.value)} title={swatch.label}
                                        className={`size-9 rounded-full transition-all cursor-pointer hover:scale-110 focus:outline-none ${active ? 'ring-2 ring-offset-2 ring-offset-foreground ring-[var(--color-accent)] scale-110' : ''}`}
                                        style={{ backgroundColor: swatch.value }} aria-label={swatch.label} aria-pressed={active}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-borders flex flex-col">
                    <span className="text-md text-muted text-center mb-2">Changes are saved automatically</span>
                    <button onClick={onClose} className="px-5 py-2 text-sm bg-background hover:bg-background/50 text-primary rounded-md transition-colors cursor-pointer">Done</button>
                </div>
            </div>
        </div>
    );
};
