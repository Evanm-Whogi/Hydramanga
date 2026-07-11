/**
 * Known search / social crawler user-agents.
 * Keep in sync with `CRAWLER_UA_RE` in server/src/services/userSettingsService.ts.
 */
export const CRAWLER_UA_RE =
  /googlebot|google-inspectiontool|storebot-google|adsbot-google|bingbot|yandex(bot|images)|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot/i;

export function isCrawlerUserAgent(ua: string | null | undefined): boolean {
  return typeof ua === 'string' && CRAWLER_UA_RE.test(ua);
}

/** Browser-only: true when the current navigator looks like a known crawler. */
export function isBrowserCrawler(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isCrawlerUserAgent(navigator.userAgent);
}
