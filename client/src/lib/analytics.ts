import posthog from 'posthog-js';
import { sanitizeErrorMessage, sanitizeStackTrace, sanitizeErrorContext, shouldTrackError } from './errorSanitizer';

/**
 * Track user view/interaction events
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, any>
) {
  if (typeof window !== 'undefined') {
    // console.log('PostHog: Tracking event', eventName, properties);
    posthog.capture(eventName, properties || {});
  }
}

/**
 * Track manga view (when user visits a manga detail page)
 */
export function trackMangaView(mangaId: string, mangaTitle: string, additionalProps?: Record<string, any>) {
  trackEvent('manga_viewed', {
    manga_id: mangaId,
    manga_title: mangaTitle,
    ...additionalProps,
  });
}

/**
 * Track chapter read (when user opens a chapter to read)
 */
export function trackChapterRead(
  mangaId: string,
  mangaTitle: string,
  chapterNumber: string | number,
  chapterId?: string
) {
  trackEvent('chapter_read', {
    manga_id: mangaId,
    manga_title: mangaTitle,
    chapter_number: chapterNumber,
    chapter_id: chapterId,
  });
}

/**
 * Track when user switches pages in the reader
 */
export function trackPageSwitch(
  mangaId: string,
  chapterNumber: string | number,
  pageNumber: number,
  totalPages: number
) {
  trackEvent('page_switched', {
    manga_id: mangaId,
    chapter_number: chapterNumber,
    page_number: pageNumber,
    total_pages: totalPages,
    progress_percent: Math.round((pageNumber / totalPages) * 100),
  });
}

/**
 * Track chapter completion
 */
export function trackChapterCompleted(
  mangaId: string,
  mangaTitle: string,
  chapterNumber: string | number
) {
  trackEvent('chapter_completed', {
    manga_id: mangaId,
    manga_title: mangaTitle,
    chapter_number: chapterNumber,
  });
}

/**
 * Track search query
 */
export function trackSearch(query: string, resultCount: number, filters?: Record<string, any>) {
  trackEvent('search_performed', {
    query,
    result_count: resultCount,
    filters,
  });
}

/**
 * Track filter usage
 */
export function trackFilterApplied(filterType: string, filterValue: any) {
  trackEvent('filter_applied', {
    filter_type: filterType,
    filter_value: filterValue,
  });
}

/**
 * Track bookmark actions
 */
export function trackBookmarkAction(
  action: 'added' | 'removed' | 'updated',
  mangaId: string,
  mangaTitle: string,
  chapterId?: string,
  chapterNumber?: string | number,
  note?: string
) {
  trackEvent(`bookmark_${action}`, {
    manga_id: mangaId,
    manga_title: mangaTitle,
    chapter_id: chapterId,
    chapter_number: chapterNumber,
    note: note,
  });
}

/**
 * Track list operations
 */
export function trackListAction(
  action: 'created' | 'deleted' | 'renamed',
  listId: string,
  listName?: string
) {
  trackEvent(`list_${action}`, {
    list_id: listId,
    list_name: listName,
  });
}

/**
 * Track adding/removing manga from lists
 */
export function trackMangaListAction(
  action: 'added_to_list' | 'removed_from_list',
  listId: string,
  listName: string,
  mangaId: string,
  mangaTitle: string
) {
  trackEvent(action, {
    list_id: listId,
    list_name: listName,
    manga_id: mangaId,
    manga_title: mangaTitle,
  });
}

/**
 * Track comment actions
 */
export function trackCommentAction(
  action: 'posted' | 'edited' | 'deleted',
  commentId?: string,
  mangaId?: string,
  mangaTitle?: string,
  commentText?: string
) {
  trackEvent(`comment_${action}`, {
    comment_id: commentId,
    manga_id: mangaId,
    manga_title: mangaTitle,
    comment_text: commentText,
  });
}

/**
 * Track reading progress milestones
 */
export function trackReadingMilestone(
  milestone: string,
  count: number
) {
  trackEvent('reading_milestone', {
    milestone,
    count,
  });
}

/**
 * Track import progress with context
 */
export function trackImportProgress(
  imported: number,
  total: number,
  status: 'in_progress' | 'completed' | 'failed',
  mangaId?: string | number,
  mangaTitle?: string
) {
  trackEvent('import_progress', {
    imported,
    total,
    status,
    percentage: Math.round((imported / total) * 100),
    manga_id: mangaId ? String(mangaId) : undefined,
    manga_title: mangaTitle,
  });
}

/**
 * Track authentication events
 */
export function trackAuthEvent(
  event: 'login' | 'logout' | 'register' | 'login_provider',
  userId?: string,
  email?: string,
  username?: string
) {
  trackEvent(`auth_${event}`, {
    user_id: userId,
    email: email,
    username: username,
  });
}

/**
 * Track navigation events
 */
export function trackNavigation(from: string, to: string) {
  trackEvent('navigated', {
    from,
    to,
  });
}

/**
 * Track user engagement time
 */
export function trackTimeSpent(page: string, seconds: number) {
  trackEvent('time_spent', {
    page,
    seconds,
    minutes: Math.round(seconds / 60),
  });
}

/**
 * Identify user in PostHog
 * Captures user profile information for person pages
 */
export function identifyUser(userId: string, userData?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    posthog.identify(userId, userData || {});
  }
}

/**
 * Clear user identification
 */
export function clearUser() {
  if (typeof window !== 'undefined') {
    posthog.reset();
  }
}

/**
 * Add breadcrumb for debugging (no-op on frontend, backend only)
 */
export function addBreadcrumb(
  message: string,
  category: string = 'user-action',
  data?: Record<string, any>
) {
  // Frontend doesn't use Sentry, this is a no-op
  // Backend Sentry will capture breadcrumbs
}

/**
 * Capture error with context (no-op on frontend, backend only)
 */
export function captureError(
  error: Error | string,
  context?: Record<string, any>
) {
  // Frontend doesn't use Sentry, just log to console
  console.error('Error:', error, context);
  // Backend Sentry will capture errors from API calls
}

/**
 * Track application errors in PostHog using proper error tracking
 * Sanitizes all sensitive information before sending to PostHog
 */
export function trackError(
  errorMessage: string,
  errorType?: string,
  errorStack?: string,
  additionalContext?: Record<string, any>
) {
  if (typeof window !== 'undefined') {
    // Check if error should be tracked
    if (!shouldTrackError(errorMessage, errorType || 'UnknownError')) {
      console.debug('Error not tracked - filtered as noisy/irrelevant');
      return;
    }

    // Sanitize sensitive information
    const sanitizedMessage = sanitizeErrorMessage(errorMessage);
    const sanitizedStack = sanitizeStackTrace(errorStack);
    const sanitizedContext = sanitizeErrorContext(additionalContext);

    // Create error object for PostHog exception tracking
    const error = new Error(sanitizedMessage);
    error.name = errorType || 'UnknownError';
    if (sanitizedStack) {
      error.stack = sanitizedStack;
    }

    // Use PostHog's exception tracking API with sanitized data
    posthog.captureException(error, {
      tags: {
        error_type: errorType,
      },
      properties: {
        error_type: errorType,
        error_stack: sanitizedStack,
        ...sanitizedContext,
      },
    });
  }
}
