export interface BanFields {
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | string | null;
}

/** True when the user has an active ban (permanent or not yet expired). */
export function isUserBanned(user: BanFields): boolean {
  if (!user.banned) return false;
  if (!user.banExpires) return true;
  return new Date(user.banExpires) > new Date();
}

export function formatBanExpires(banExpires: Date | string | null | undefined): string | null {
  if (!banExpires) return null;
  return new Date(banExpires).toLocaleString();
}
