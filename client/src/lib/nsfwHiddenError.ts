/** Thrown when the API refuses a series because the viewer's NSFW preference hides it. */
export class NsfwHiddenError extends Error {
  readonly code = 'NSFW_HIDDEN' as const;

  constructor(message = 'This title is marked NSFW. Enable NSFW content to view it.') {
    super(message);
    this.name = 'NsfwHiddenError';
  }
}

export function isNsfwHiddenError(error: unknown): error is NsfwHiddenError {
  if (error instanceof NsfwHiddenError) return true;
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; code?: string };
  return e.name === 'NsfwHiddenError' || e.code === 'NSFW_HIDDEN';
}
