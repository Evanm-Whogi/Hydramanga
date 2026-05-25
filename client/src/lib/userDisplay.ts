type UserLike = {
  displayUsername?: string | null;
  username?: string | null;
  name?: string | null;
};

export function getUserDisplayName(user: UserLike | null | undefined): string {
  if (!user) return "User";
  return user.displayUsername || user.username || user.name || "User";
}

export function isEmailIdentifier(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
