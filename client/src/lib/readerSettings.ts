/**
 * Reader Settings Management
 * Handles localStorage persistence and default values for manga reader settings
 */

export type ReadingDirection = 'ttb' | 'ltr' | 'rtl';

export type AutoScrollSpeed = 'off' | 'slow' | 'medium' | 'fast';

export type ProgressIndicatorPosition = 'off' | 'top' | 'bottom' | 'right';

export interface ReaderSettings {
  readingDirection: ReadingDirection;
  tapZones: boolean;
  readerPadding: number; // -1.00 to 1.00
  imageGap: number; // vertical padding between images in px (0-48)
  autoScroll: AutoScrollSpeed;
  progressIndicator: ProgressIndicatorPosition;
  continuousMode: boolean;
  stickyHeader: boolean;
  greyscale: boolean;
  dimPages: boolean;
  dimLevel: number; // 0-100, higher = darker
}

const DEFAULT_SETTINGS: ReaderSettings = {
  readingDirection: 'ttb',
  tapZones: true,
  readerPadding: 0,
  imageGap: 0,
  autoScroll: 'off',
  progressIndicator: 'right',
  continuousMode: true,
  stickyHeader: false,
  greyscale: false,
  dimPages: false,
  dimLevel: 30,
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

    // Migrate legacy readingMode field
    const readingDirection: ReadingDirection =
      parsed.readingDirection === 'ltr' || parsed.readingDirection === 'rtl' || parsed.readingDirection === 'ttb'
        ? parsed.readingDirection
        : DEFAULT_SETTINGS.readingDirection;

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      readingDirection,
      readerPadding: Math.max(-1, Math.min(1, parsed.readerPadding ?? DEFAULT_SETTINGS.readerPadding)),
      imageGap: Math.max(0, Math.min(48, parsed.imageGap ?? DEFAULT_SETTINGS.imageGap)),
      dimLevel: Math.max(0, Math.min(100, parsed.dimLevel ?? DEFAULT_SETTINGS.dimLevel)),
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
