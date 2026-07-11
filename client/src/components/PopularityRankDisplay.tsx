import { Crown, Trophy } from "lucide-react";
import { formatGlobalRankTooltip, formatPopularityRank, formatTypeRankTooltip, resolveGlobalRank, resolveTypeRank, type PopularityFields } from "@/lib/popularityRank";

function RankBadge({ kind, rank, seriesType, compact }: { kind: "global" | "type"; rank: number; seriesType?: string | null; compact?: boolean }) {
  const Icon = kind === "global" ? Crown : Trophy;
  const tooltip = kind === "global" ? formatGlobalRankTooltip(rank) : formatTypeRankTooltip(rank, seriesType);
  const iconClass = kind === "global" ? "text-amber-400" : "text-amber-300";
  return (
    <span title={tooltip} className={`inline-flex items-center gap-1 ${compact ? "text-sm font-semibold text-white" : "text-sm text-muted"}`}>
      <Icon className={`${compact ? "size-3.5" : "size-4"} ${iconClass}`} aria-hidden />
      <span>{formatPopularityRank(rank)}</span>
    </span>
  );
}

export default function PopularityRankDisplay({ fields, seriesType, compact = false, className = "" }: { fields: PopularityFields; seriesType?: string | null; compact?: boolean; className?: string }) {
  const globalRank = resolveGlobalRank(fields);
  const typeRank = resolveTypeRank(fields);
  if (globalRank == null && typeRank == null) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {globalRank != null ? <RankBadge kind="global" rank={globalRank} compact={compact} /> : null}
      {globalRank != null && typeRank != null ? <span aria-hidden className={compact ? "text-white/60" : "text-muted/60"}>·</span> : null}
      {typeRank != null ? <RankBadge kind="type" rank={typeRank} seriesType={seriesType} compact={compact} /> : null}
    </span>
  );
}
