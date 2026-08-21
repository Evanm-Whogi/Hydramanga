import { Crown, Trophy } from "lucide-react";
import { formatGlobalRankTooltip, formatPopularityRank, formatTypeRankTooltip, resolveGlobalRank, resolveTypeRank, type PopularityFields } from "@/lib/popularityRank";

function RankBadge({ kind, rank, seriesType, compact, fluid }: { kind: "global" | "type"; rank: number; seriesType?: string | null; compact?: boolean; fluid?: boolean }) {
  const Icon = kind === "global" ? Crown : Trophy;
  const tooltip = kind === "global" ? formatGlobalRankTooltip(rank) : formatTypeRankTooltip(rank, seriesType);
  const iconClass = kind === "global" ? "text-amber-400" : "text-amber-300";
  const iconSizeClass = fluid ? "size-[1em] shrink-0" : compact ? "size-3.5 shrink-0" : "size-4 shrink-0";
  const textClass = compact ? (fluid ? "min-w-0 text-[1em] font-semibold text-white" : "text-sm font-semibold text-white") : "text-sm text-muted";
  return (
    <span title={tooltip} className={`inline-flex min-w-0 items-center gap-0.5 ${textClass}`}>
      <Icon className={`${iconSizeClass} ${iconClass}`} aria-hidden />
      <span>{formatPopularityRank(rank)}</span>
    </span>
  );
}

export default function PopularityRankDisplay({ fields, seriesType, compact = false, fluid = false, className = "" }: { fields: PopularityFields; seriesType?: string | null; compact?: boolean; fluid?: boolean; className?: string }) {
  const globalRank = resolveGlobalRank(fields);
  const typeRank = resolveTypeRank(fields);
  if (globalRank == null && typeRank == null) return null;

  return (
    <span className={`inline-flex min-w-0 items-center gap-0.5 ${className}`}>
      {globalRank != null ? <RankBadge kind="global" rank={globalRank} compact={compact} fluid={fluid} /> : null}
      {globalRank != null && typeRank != null ? <span aria-hidden className={`shrink-0 ${compact ? "text-white/60" : "text-muted/60"}`}>·</span> : null}
      {typeRank != null ? <RankBadge kind="type" rank={typeRank} seriesType={seriesType} compact={compact} fluid={fluid} /> : null}
    </span>
  );
}
