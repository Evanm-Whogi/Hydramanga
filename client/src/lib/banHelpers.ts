export interface BanFields {
  banned?: boolean | null;
  isBanned?: boolean;
  banReason?: string | null;
  banExpires?: string | Date | null;
}

export function isUserBanned(user: BanFields): boolean {
  if (user.isBanned !== undefined) return user.isBanned;
  if (!user.banned) return false;
  if (!user.banExpires) return true;
  return new Date(user.banExpires) > new Date();
}

export function formatBanExpiry(banExpires: string | null | undefined): string {
  if (!banExpires) return "Permanent";
  return new Date(banExpires).toLocaleString();
}

/** banExpiresIn in seconds for API */
export const BAN_DURATION_OPTIONS = [
  { label: "Permanent", value: "" },
  { label: "1 day", value: String(60 * 60 * 24) },
  { label: "7 days", value: String(60 * 60 * 24 * 7) },
  { label: "30 days", value: String(60 * 60 * 24 * 30) },
  { label: "90 days", value: String(60 * 60 * 24 * 90) },
] as const;
