"use client";

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { ReadingDirection } from '@/lib/readerSettings';

interface KeybindsModalProps {
  isOpen: boolean;
  onClose: () => void;
  readingDirection: ReadingDirection;
}

const SIDEBAR_BTN = "px-6 py-2 bg-accent hover:bg-accent/80 text-white rounded-md font-medium transition-colors cursor-pointer";

export default function KeybindsModal({ isOpen, onClose, readingDirection }: KeybindsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const pageKeys = readingDirection === 'rtl'
    ? [{ keys: '→', action: 'Previous page' }, { keys: '←', action: 'Next page' }]
    : readingDirection === 'ltr'
      ? [{ keys: '←', action: 'Previous page' }, { keys: '→', action: 'Next page' }]
      : [{ keys: '↑', action: 'Previous page' }, { keys: '↓', action: 'Next page' }];

  const chapterKeys = readingDirection === 'ttb'
    ? [{ keys: '←', action: 'Previous chapter' }, { keys: '→', action: 'Next chapter' }]
    : [{ keys: '↑', action: 'Previous chapter' }, { keys: '↓', action: 'Next chapter' }];

  const rows = [
    ...pageKeys,
    ...chapterKeys,
    { keys: 'Esc', action: 'Close modals and sidebars' },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-200" onMouseDown={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-foreground rounded-lg shadow-xl z-201 w-full max-w-sm">
        <div className="flex items-center justify-between p-6 border-b border-borders">
          <h2 className="text-xl font-bold text-white">Keybinds</h2>
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors cursor-pointer" aria-label="Close keybinds">
            <X className="size-6" />
          </button>
        </div>
        <div className="p-6">
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.keys} className="flex items-center justify-between gap-4">
                <kbd className="px-2.5 py-1 bg-background border border-borders rounded text-sm font-mono text-primary">{row.keys}</kbd>
                <span className="text-sm text-primary/80 text-right">{row.action}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-6 border-t border-borders flex justify-end">
          <button onClick={onClose} className={SIDEBAR_BTN}>Close</button>
        </div>
      </div>
    </>
  );
}
