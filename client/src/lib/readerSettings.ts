/**
 * Reader Settings Management
 * Handles localStorage persistence and default values for manga reader settings
 */

export type ReadingMode = 'default';

export type AutoScrollSpeed = 'off' | 'slow' | 'medium' | 'fast';

export type ProgressIndicatorPosition = 'off' | 'top' | 'bottom' | 'right';

export interface ReaderSettings {
  readingMode: ReadingMode;
  tapZones: boolean;
  readerPadding: number; // -1.00 to 1.00
  imageGap: number; // vertical padding between images in px (0-48)
  autoScroll: AutoScrollSpeed;
  progressIndicator: ProgressIndicatorPosition;
  continuousMode: boolean;
  stickyHeader: boolean;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  readingMode: 'default',
  tapZones: true,
  readerPadding: 0,
  imageGap: 0,
  autoScroll: 'off',
  progressIndicator: 'right',
  continuousMode: true,
  stickyHeader: false,
};

const STORAGE_KEY = 'manga-reader-settings';

/**
 * Load reader settings from localStorage
 */
export function loadReaderSettings(): ReaderSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(stored);
    
    // Validate and merge with defaults to handle new settings
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      // Ensure values are within valid ranges
      readerPadding: Math.max(-1, Math.min(1, parsed.readerPadding ?? DEFAULT_SETTINGS.readerPadding)),
      imageGap: Math.max(0, Math.min(48, parsed.imageGap ?? DEFAULT_SETTINGS.imageGap)),
    };
  } catch (error) {
    console.error('Failed to load reader settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save reader settings to localStorage
 */
export function saveReaderSettings(settings: ReaderSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save reader settings:', error);
  }
}

/**
 * Update a specific setting
 */
export function updateReaderSetting<K extends keyof ReaderSettings>(
  key: K,
  value: ReaderSettings[K]
): ReaderSettings {
  const current = loadReaderSettings();
  const updated = { ...current, [key]: value };
  saveReaderSettings(updated);
  return updated;
}

/**
 * Reset settings to defaults
 */
export function resetReaderSettings(): ReaderSettings {
  saveReaderSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

/**
 * Get auto-scroll speed in pixels per second
 */
export function getAutoScrollSpeed(speed: AutoScrollSpeed): number {
  switch (speed) {
    case 'slow':
      return 30;
    case 'medium':
      return 60;
    case 'fast':
      return 90;
    case 'off':
    default:
      return 0;
  }
}
