import Link from "next/link";
import Image from "next/image";
import { MessageCircle, TrendingDown, TrendingUp } from "lucide-react";
import BadgeList from "@/components/badges/BadgeList";

const rankStyles: Record<number, string> = {
  1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  2: "bg-slate-400/20 text-slate-300 border-slate-400/40",
  3: "bg-amber-700/20 text-amber-600 border-amber-700/40",
};

function TrendLabel({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-500">
        <TrendingUp className="size-3" />
        +{trend}% this week
      </span>
    );
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
        <TrendingDown className="size-3" />
        {trend}% this week
      </span>
    );
  }
  return <span className="text-xs text-muted">No change this week</span>;
}

export default function TopCommenterItem({ user, rank }: { user: any; rank: number }) {
  const rankClass = rankStyles[rank] ?? "bg-background text-muted border-borders";

  return (
    <Link
      href={`/users/${user.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-background/40"
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${rankClass}`}
      >
        {rank}
      </span>
      <Image
        src={user.image || "/media/pfp/default.jpg"}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-full object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-primary">{user.name}</p>
          <BadgeList badges={user.badges} iconSize={12} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <MessageCircle className="size-3" />
            {user.totalComments?.toLocaleString()} comments
          </span>
          <TrendLabel trend={user.trend} />
        </div>
      </div>
    </Link>
  );
}
