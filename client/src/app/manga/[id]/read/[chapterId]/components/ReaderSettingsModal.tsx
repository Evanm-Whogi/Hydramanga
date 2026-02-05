"use client";

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  ReaderSettings,
  ReadingMode,
  AutoScrollSpeed,
  ProgressIndicatorPosition,
  loadReaderSettings,
  saveReaderSettings,
} from '@/lib/readerSettings';

interface ReaderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: ReaderSettings) => void;
}

export default function ReaderSettingsModal({
  isOpen,
  onClose,
  onSettingsChange,
}: ReaderSettingsModalProps) {
  const [settings, setSettings] = useState<ReaderSettings>(() => loadReaderSettings());

  useEffect(() => {
    if (isOpen) {
      setSettings(loadReaderSettings());
    }
  }, [isOpen]);

  const handleChange = <K extends keyof ReaderSettings>(
    key: K,
    value: ReaderSettings[K]
  ) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveReaderSettings(updated);
    onSettingsChange(updated);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-foreground rounded-lg shadow-xl z-201 w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-borders">
          <h2 className="text-xl font-bold text-white">Reader Settings</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="size-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Tap Zones */}
          <div>
            <label className="flex items-center justify-between">
              <span className="text-sm font-semibold text-primary">Tap Zones</span>
              <button
                onClick={() => handleChange('tapZones', !settings.tapZones)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.tapZones ? 'bg-accent' : 'bg-muted/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.tapZones ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
            <p className="text-xs text-muted/70 mt-1">
              {settings.tapZones
                ? 'Click left/right sides to navigate, center to toggle controls'
                : 'Tap zones disabled'}
            </p>
          </div>

          {/* Reader Padding */}
          <div>
            <label className="block text-sm font-semibold text-primary mb-2">
              Reader Padding: {settings.readerPadding.toFixed(2)}
            </label>
            <div className="relative">
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={settings.readerPadding}
                onChange={(e) => handleChange('readerPadding', parseFloat(e.target.value))}
                className="w-full h-2 bg-muted/30 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              {/* Zero marker */}
              <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-3 bg-accent pointer-events-none" style={{ top: '-2px' }} />
            </div>
            <div className="flex justify-between text-xs text-muted/70 mt-1">
              <span>Zoom in</span>
              <span className="text-accent">0.00</span>
              <span>Zoom out</span>
            </div>
          </div>

          {/* Auto Scroll */}
          <div>
            <label className="block text-sm font-semibold text-primary mb-2">
              Auto Scroll
            </label>
            <select
              value={settings.autoScroll}
              onChange={(e) => handleChange('autoScroll', e.target.value as AutoScrollSpeed)}
              className="w-full px-3 py-2 bg-background text-primary border border-borders rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="off">Off</option>
              <option value="slow">Slow (30px/s)</option>
              <option value="medium">Medium (60px/s)</option>
              <option value="fast">Fast (90px/s)</option>
            </select>
            <p className="text-xs text-muted/70 mt-1">
              {settings.autoScroll === 'off'
                ? 'Auto-scroll disabled'
                : 'Automatically scrolls down the page'}
            </p>
          </div>

          {/* Progress Indicator */}
          <div>
            <label className="block text-sm font-semibold text-primary mb-2">
              Progress Indicator
            </label>
            <select
              value={settings.progressIndicator}
              onChange={(e) => handleChange('progressIndicator', e.target.value as ProgressIndicatorPosition)}
              className="w-full px-3 py-2 bg-background text-primary border border-borders rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="off">Off</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="right">Right (Default)</option>
            </select>
            <p className="text-xs text-muted/70 mt-1">
              {settings.progressIndicator === 'off' && 'Progress indicator hidden'}
              {settings.progressIndicator === 'top' && 'Horizontal bar at the top'}
              {settings.progressIndicator === 'bottom' && 'Horizontal bar at the bottom'}
              {settings.progressIndicator === 'right' && 'Vertical bar on the right side'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-borders flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-accent hover:bg-accent/80 text-white rounded-md font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
