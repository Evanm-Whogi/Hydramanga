export function getPublicVersion(): string {
  return process.env.NEXT_PUBLIC_VERSION?.trim() || 'B-1.00';
}

export function isBetaVersion(version: string = getPublicVersion()): boolean {
  return version.toUpperCase().startsWith('B');
}

export function isAlphaVersion(version: string = getPublicVersion()): boolean {
  return version.toUpperCase().startsWith('A');
}
