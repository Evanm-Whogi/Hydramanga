export type PopularityFields = {
  popularityGlobalCurrent?: number | null;
  popularityTypeCurrent?: number | null;
  popularity?: {
    global?: { current?: number | null } | null;
    type?: { current?: number | null } | null;
  } | null;
};

export function resolveGlobalRank(fields: PopularityFields): number | null {
  const rank = fields.popularity?.global?.current ?? fields.popularityGlobalCurrent;
  return typeof rank === 'number' && Number.isFinite(rank) ? rank : null;
}

export function resolveTypeRank(fields: PopularityFields): number | null {
  const rank = fields.popularity?.type?.current ?? fields.popularityTypeCurrent;
  return typeof rank === 'number' && Number.isFinite(rank) ? rank : null;
}

export function formatCompactRank(rank: number): string {
  if (rank >= 1_000_000) return `${Math.round(rank / 1_000_000)}m`;
  if (rank >= 1_000) return `${Math.round(rank / 1_000)}k`;
  return String(rank);
}

export function formatPopularityRank(rank: number | null | undefined): string {
  return rank != null ? `#${formatCompactRank(rank)}` : '—';
}

export function formatGlobalRankTooltip(rank: number): string {
  return `#${rank} most popular series`;
}

export function formatTypeRankTooltip(rank: number, seriesType?: string | null): string {
  const label = seriesType?.trim().toLowerCase() || 'manga';
  return `#${rank} most popular ${label}`;
}
