"use client";

import { useMemo, useState } from "react";

const TYPE_COLORS: Record<string, string> = {
  manga: "#22c55e",
  manhwa: "#f97316",
  manhua: "#3b82f6",
  other: "#64748b",
};

const TYPE_ORDER = ["manga", "manhwa", "manhua", "other"];

const GENRE_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
];

function toPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function toExactPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return (value / total) * 100;
}

function buildColorMap(keys: string[], baseColors?: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = { ...baseColors };
  keys.forEach((key, index) => {
    if (!map[key]) map[key] = GENRE_PALETTE[index % GENRE_PALETTE.length];
  });
  if (!map.other) map.other = "#64748b";
  return map;
}

function buildStackedEntries(sorted: [string, number][], limit?: number, expanded = false): [string, number][] {
  if (!limit || expanded || sorted.length <= limit) return sorted;
  const top = sorted.slice(0, limit);
  const otherCount = sorted.slice(limit).reduce((sum, [, count]) => sum + count, 0);
  if (otherCount <= 0) return top;
  return [...top, ["other", otherCount]];
}

function ColorDot({ color, size = "size-2.5" }: { color: string; size?: string }) {
  return <span className={`${size} rounded-full shrink-0`} style={{ backgroundColor: color }} />;
}

function StackedBreakdownBar({ entries, total, colors, labels }: { entries: [string, number][]; total: number; colors: Record<string, string>; labels?: Record<string, string> }) {
  if (total <= 0 || entries.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      <div className="flex h-3 w-full rounded-full overflow-hidden bg-background">
        {entries.map(([key, count]) => (
          <div
            key={key}
            className="h-full"
            style={{ width: `${toExactPercent(count, total)}%`, backgroundColor: colors[key] ?? "#64748b" }}
            title={`${labels?.[key] ?? (key === "other" ? "Other" : key)}: ${toPercent(count, total)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.map(([key, count]) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <ColorDot color={colors[key] ?? "#64748b"} />
            {labels?.[key] ?? (key === "other" ? "Other" : key.charAt(0).toUpperCase() + key.slice(1))} {toPercent(count, total)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export default function BreakdownBars({ title, breakdown, labels, colors, fixedOrder, stackedBar = false, stackedBarLimit, initialVisibleCount }: { title: string; breakdown: Record<string, number>; labels?: Record<string, string>; colors?: Record<string, string>; fixedOrder?: string[]; stackedBar?: boolean; stackedBarLimit?: number; initialVisibleCount?: number }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(breakdown).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  const sorted = useMemo((): [string, number][] => {
    if (fixedOrder) {
      return fixedOrder
        .map((key) => [key, breakdown[key] ?? 0] as [string, number])
        .filter(([, count]) => count > 0);
    }
    return [...entries].sort((a, b) => b[1] - a[1]);
  }, [breakdown, entries, fixedOrder]);

  const colorMap = useMemo(() => buildColorMap(sorted.map(([key]) => key), colors), [sorted, colors]);
  const stackedEntries = buildStackedEntries(sorted, stackedBarLimit, expanded);
  const visible = initialVisibleCount && !expanded ? sorted.slice(0, initialVisibleCount) : sorted;
  const hiddenCount = initialVisibleCount ? Math.max(0, sorted.length - initialVisibleCount) : 0;

  if (total === 0) {
    return (
      <div>
        <h4 className="text-sm font-semibold text-primary mb-3">{title}</h4>
        <p className="text-sm text-muted">No data yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-primary mb-3">{title}</h4>
      {stackedBar && <StackedBreakdownBar entries={stackedEntries} total={total} colors={colorMap} labels={labels} />}
      <div className="space-y-3">
        {visible.map(([key, count]) => {
          const pct = toPercent(count, total);
          const label = labels?.[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
          const barColor = colorMap[key] ?? "var(--color-accent)";
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <ColorDot color={barColor} size="size-2" />
                  {label}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-background overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
              </div>
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 && !expanded && (
        <button type="button" onClick={() => setExpanded(true)} className="mt-3 text-sm text-accent hover:underline">
          Show more ({hiddenCount})
        </button>
      )}
      {expanded && hiddenCount > 0 && (
        <button type="button" onClick={() => setExpanded(false)} className="mt-3 text-sm text-accent hover:underline">
          Show less
        </button>
      )}
    </div>
  );
}

export { TYPE_COLORS, TYPE_ORDER };
