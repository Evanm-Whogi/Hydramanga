import { formatJobProgress } from "@/lib/jobProgress";

interface JobProgressDisplayProps {
  progress: number | string | null;
  compact?: boolean;
  className?: string;
}

export default function JobProgressDisplay({ progress, compact = false, className = "" }: JobProgressDisplayProps) {
  const { label, percent } = formatJobProgress(progress);

  if (percent == null) {
    return <span className={`text-muted tabular-nums ${className}`}>{label}</span>;
  }

  return (
    <div className={className}>
      <span className="tabular-nums text-sm font-medium text-teal-400">{label}</span>
      {!compact && (
        <div className="mt-1.5 h-1.5 w-full min-w-[3rem] rounded-full bg-background overflow-hidden">
          <div
            className="h-full rounded-full bg-teal-500/80 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
