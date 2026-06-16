import { ClockIcon, AlertTriangleIcon } from "lucide-react";
import type { ReleaseSchedule } from "@/lib/releaseSchedule";
import { formatOverdueDuration, formatTimeUntil } from "@/lib/utils";

interface ReleaseTrackerProps {
  schedule: ReleaseSchedule;
  isHiatus?: boolean;
}

function getNextChapterLabel(schedule: ReleaseSchedule): string {
  if (schedule.isOverdue) {
    return formatOverdueDuration(schedule.overdueDays ?? 0);
  }
  return formatTimeUntil(schedule.predictedNext);
}

export default function ReleaseTracker({ schedule, isHiatus = false }: ReleaseTrackerProps) {
  const { cadenceLabel, sampleSize, confidence } = schedule;
  const nextChapterLabel = getNextChapterLabel(schedule);

  return (
    <div className="bg-foreground rounded-md p-4 w-full">
      <div className="flex items-start gap-3">
        {}
        <ClockIcon className="size-5 text-accent shrink-0 mt-0.5" aria-hidden />
        <div className="flex flex-col gap-2 text-sm min-w-0 w-full">
          <div className="flex flex-row gap-2 place-content-between">
            <p className={`font-medium text-base ${schedule.isOverdue ? 'text-amber-400' : 'text-primary'}`}>New chapter {nextChapterLabel}</p>
            <span className="text-primary text-base">{cadenceLabel} (based on last {sampleSize} chapters)</span>
          </div>

          {confidence === 'low' && (
            <p className="text-xs text-muted">Schedule varies; prediction is approximate.</p>
          )}
          {isHiatus && (
            <div className="flex gap-2 text-xs text-amber-400/90 bg-amber-400/10 rounded-md items-center">
              <AlertTriangleIcon className="size-4 shrink-0 mt-0.5" aria-hidden />
              <span>Series is on hiatus — schedule may not apply.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
