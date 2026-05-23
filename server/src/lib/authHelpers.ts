export function isAdminRole(role?: string | null): boolean {
  return role?.toLowerCase() === "admin";
}
