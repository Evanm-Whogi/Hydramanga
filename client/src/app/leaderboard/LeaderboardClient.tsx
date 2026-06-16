"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Flame, MessageSquare, Star, Trophy, Crown, Medal } from "lucide-react";
import { getLeaderboard, LEADERBOARD_PAGE_SIZE } from "@/services/leaderboardService";
import type { LeaderboardPeriod, LeaderboardTab, LeaderboardUserRow } from "@/types/leaderboard";
import { getUserDisplayName } from "@/lib/userDisplay";
import { formatCompactNumber } from "@/lib/utils";
import ProfilePagination from "@/app/profile/components/ProfilePagination";

const TABS: { id: LeaderboardTab; label: string; icon: typeof Trophy }[] = [
  { id: "overall", label: "Overall", icon: Trophy },
  { id: "chapters", label: "Chapters", icon: BookOpen },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "streaks", label: "Streaks", icon: Flame },
  { id: "reviews", label: "Reviews", icon: Star },
];

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

const SORT_COLUMN: Record<LeaderboardTab, keyof LeaderboardUserRow> = {
  overall: "xp",
  chapters: "chapters",
  streaks: "streak",
  comments: "comments",
  reviews: "reviews",
};

const TAB_METRIC_LABEL: Record<LeaderboardTab, string> = {
  overall: "XP",
  chapters: "chapters",
  streaks: "days",
  comments: "comments",
  reviews: "reviews",
};

function getProfileHref(row: LeaderboardUserRow) {
  return `/users/${encodeURIComponent(row.username || row.id)}`;
}

function periodButtonClass(active: boolean) {
  return `rounded-md cursor-pointer px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-accent text-white" : "bg-foreground text-muted hover:text-primary"}`;
}

function tabButtonClass(active: boolean) {
  return `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${active ? "bg-accent text-white shadow-sm" : "bg-foreground text-muted hover:text-primary"}`;
}

function sortHeaderClass(active: boolean) {
  return `px-4 py-3 transition-colors ${active ? "text-accent font-semibold" : ""}`;
}

function formatTabTotal(row: LeaderboardUserRow, tab: LeaderboardTab) {
  const value = formatCompactNumber(row.tabTotal);
  const label = TAB_METRIC_LABEL[tab];
  if (tab === "streaks") {
    return `${value} ${row.tabTotal === 1 ? "day" : label}`;
  }
  return `${value} ${label}`;
}

function showIcon(rank: number) {
  if (rank === 1) {
    return <Crown className="m-auto mb-3 size-10 text-accent" />;
  } else if (rank === 2) {
    return <Medal className="m-auto mb-3 size-10 text-yellow-500" />;
  } else if (rank === 3) {
    return <Medal className="m-auto mb-3 size-10 text-gray-400" />;
  }
  return null;
}

function placeBadgeClass(place: number) {
  if (place === 1) return "bg-accent";
  if (place === 2) return "bg-yellow-500";
  return "bg-gray-400";
}

function PodiumCard({ row, tab, place }: { row: LeaderboardUserRow; tab: LeaderboardTab; place: number }) {
  return (
    <Link
      href={getProfileHref(row)}
      className={`flex-1 min-w-0 bg-foreground border border-borders rounded-lg p-5 text-center hover:border-accent/50 transition-colors w-full md:w-auto`}>
      {showIcon(place)}
      <div className="flex justify-center mb-3">
        <div className="relative inline-flex">
          <Image
            src={row.image || "/media/pfp/default.jpg"}
            alt=""
            width={80}
            height={80}
            className="rounded-full object-cover border-2 border-borders"
          />
          <span className={`absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-foreground text-xs font-bold text-white ${placeBadgeClass(place)}`}>
            {place}
          </span>
        </div>
      </div>
      <p className="font-semibold text-primary truncate">{getUserDisplayName(row)}</p>
      <div className="flex flex-row gap-1 items-center justify-center">
        <p className="text-xs text-muted mt-1 items-center">Lv.{row.karma.level} {row.karma.levelName}</p>
        <span className=" text-borders">|</span>
        <p className="text-xs text-muted mt-1 items-center">{formatCompactNumber(row.karma.totalKarma)} XP</p>
      </div>
      <p className="text-lg font-bold text-accent">{formatTabTotal(row, tab)}</p>
    </Link>
  );
}

export default function LeaderboardClient() {
  const [tab, setTab] = useState<LeaderboardTab>("overall");
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");
  const [page, setPage] = useState(1);
  const [podium, setPodium] = useState<LeaderboardUserRow[]>([]);
  const [rows, setRows] = useState<LeaderboardUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tableKey, setTableKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    getLeaderboard({ tab, period: tab === "overall" ? period : "all", page, limit: LEADERBOARD_PAGE_SIZE })
      .then((data) => {
        setPodium(data.podium);
        setRows(data.rows);
        setTotal(data.pagination.total);
        setTableKey((key) => key + 1);
      })
      .catch(() => {
        setPodium([]);
        setRows([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [tab, period, page]);

  const handleTabChange = (nextTab: LeaderboardTab) => {
    setTab(nextTab);
    setPage(1);
  };

  const handlePeriodChange = (nextPeriod: LeaderboardPeriod) => {
    setPeriod(nextPeriod);
    setPage(1);
  };

  const activeSort = SORT_COLUMN[tab];
  const showEmpty = !loading && podium.length === 0 && rows.length === 0;

  return (
    <div className="container mx-auto px-4 xl:px-0 py-8 space-y-6 w-full md:w-2/3">
      <div className="flex flex-wrap items-center gap-2 place-content-between">     
        <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={tabButtonClass(tab === id)} onClick={() => handleTabChange(id)}>
            <Icon className="size-4" />
            {label}
          </button>
        ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-2 md:mt-0">
        {tab === "overall" && (
          <>
            {PERIODS.map(({ id, label }) => (
              <button key={id} type="button" className={periodButtonClass(period === id)} onClick={() => handlePeriodChange(id)}>
                {label}
              </button>
            ))}
          </>
        )}
        </div>
      </div>

      {podium.length > 0 && (
        <div className="flex flex-col sm:flex-row items-end gap-4">
          {podium.map((row) => (
            <PodiumCard key={row.id} row={row} tab={tab} place={row.rank} />
          ))}
        </div>
      )}

      <div className="bg-foreground rounded-lg overflow-hidden border border-borders">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[720px]">
            <thead className="bg-background text-muted text-sm">
              <tr>
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3 min-w-[220px]">User</th>
                <th className={sortHeaderClass(activeSort === "chapters")}>Chapters</th>
                <th className={sortHeaderClass(activeSort === "comments")}>Comments</th>
                <th className={sortHeaderClass(activeSort === "streak")}>Streak</th>
                <th className={sortHeaderClass(activeSort === "reviews")}>Reviews</th>
                <th className={sortHeaderClass(activeSort === "xp")}>XP</th>
              </tr>
            </thead>
            <tbody
              key={tableKey}
              className={`transition-opacity duration-300 ${loading ? "opacity-40" : "opacity-100 animate-in fade-in slide-in-from-bottom-1 duration-300"}`}
            >
              {loading && rows.length === 0 && podium.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : showEmpty ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No data yet.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No more rankings.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-borders hover:bg-background/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-accent">{row.rank}</td>
                    <td className="px-4 py-3">
                      <Link href={getProfileHref(row)} className="flex items-center gap-3 hover:text-accent w-fit">
                        <Image
                          src={row.image || "/media/pfp/default.jpg"}
                          alt=""
                          width={40}
                          height={40}
                          className="rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-primary truncate">{getUserDisplayName(row)}</p>
                          <p className="text-xs text-muted">
                            Lv.{row.karma.level} {row.karma.levelName}
                            <span className="mx-1.5 text-borders">|</span>
                            {formatCompactNumber(row.karma.totalKarma)} XP
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className={`px-4 py-3 ${activeSort === "chapters" ? "text-accent font-semibold" : "text-primary"}`}>
                      {row.chapters.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 ${activeSort === "comments" ? "text-accent font-semibold" : "text-primary"}`}>
                      {row.comments.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 ${activeSort === "streak" ? "text-accent font-semibold" : "text-primary"}`}>
                      {row.streak} {row.streak === 1 ? "day" : "days"}
                    </td>
                    <td className={`px-4 py-3 ${activeSort === "reviews" ? "text-accent font-semibold" : "text-primary"}`}>
                      {row.reviews.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 ${activeSort === "xp" ? "text-accent font-semibold" : "text-primary"}`}>
                      {formatCompactNumber(row.xp)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 pb-4">
          <ProfilePagination page={page} total={total} limit={LEADERBOARD_PAGE_SIZE} onPageChange={setPage} loading={loading} />
        </div>
      </div>
    </div>
  );
}
