"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getLeaderboardSummary, getLeaderboardCommenters, getLeaderboardReaders, getLeaderboardStreaks } from "@/services/leaderboardService";
import type { LeaderboardSummary, LeaderboardUserRow } from "@/types/leaderboard";

type Tab = "commenters" | "readers" | "streaks";

const tabClass = (active: boolean) =>
  `${active ? "bg-accent text-white" : "bg-foreground text-muted"} hover:opacity-90 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer`;

export default function LeaderboardClient() {
  const [summary, setSummary] = useState<LeaderboardSummary | null>(null);
  const [tab, setTab] = useState<Tab>("commenters");
  const [rows, setRows] = useState<LeaderboardUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboardSummary().then(setSummary).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const fetcher =
      tab === "commenters"
        ? getLeaderboardCommenters
        : tab === "readers"
          ? getLeaderboardReaders
          : getLeaderboardStreaks;
    fetcher()
      .then((data) => setRows(data.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [tab]);

  const metricLabel =
    tab === "commenters" ? "Comments" : tab === "readers" ? "Series read" : "Longest streak";

  return (
    <div className="container mx-auto px-4 xl:px-0 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 w-full md:w-2/3 mx-auto text-center">
        <div className="flex-1 bg-foreground rounded-lg p-5 border border-borders">
          <p className="text-3xl font-bold text-primary">{summary?.totalComments?.toLocaleString() ?? "—"}</p>
          <p className="text-sm text-muted">Comments</p>

        </div>
        <div className="flex-1 bg-foreground rounded-lg p-5 border border-borders">
          <p className="text-3xl font-bold text-primary">{summary?.totalMembers?.toLocaleString() ?? "—"}</p>
          <p className="text-sm text-muted">Members</p>

        </div>
        <div className="flex-1 bg-foreground rounded-lg p-5 border border-borders">
          <p className="text-3xl font-bold text-primary">{summary?.commentsThisMonth?.toLocaleString() ?? "—"}</p>
          <p className="text-sm text-muted">This month</p>

        </div>
      </div>

      <div className="flex flex-row w-full md:w-2/3 mx-auto">
      <div className="flex flex-wrap gap-2 mx-auto text-center bg-foreground rounded-lg p-1">
        <button type="button" className={`${tabClass(tab === "commenters")}`} onClick={() => setTab("commenters")}>
          Commenters
        </button>
        <button type="button" className={`${tabClass(tab === "readers")}`} onClick={() => setTab("readers")}>
          Readers
        </button>
        <button type="button" className={`${tabClass(tab === "streaks")}`} onClick={() => setTab("streaks")}>
          Streaks
        </button>
      </div>
      </div>

      <div className="bg-foreground rounded-lg overflow-hidden w-full md:w-2/3 mx-auto">
        <table className="w-full text-left">
          <thead className="bg-background text-muted text-sm">
            <tr>
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">{metricLabel}</th>
              <th className="px-4 py-3">Karma / Level</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No data yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-borders hover:bg-background/30">
                  <td className="px-4 py-3 font-semibold text-accent">{row.rank}</td>
                  <td className="px-4 py-3">
                    <Link href={`/users/${row.id}`} className="flex items-center gap-3 hover:text-accent w-fit">
                      <Image
                        src={row.image || "/default-avatar.jpg"}
                        alt=""
                        width={36}
                        height={36}
                        className="rounded-full object-cover"
                      />
                      <span className="font-medium text-primary">{row.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-primary">
                    {tab === "commenters" && row.commentCount}
                    {tab === "readers" && row.seriesRead}
                    {tab === "streaks" && `${row.longestStreak} days`}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {row.karma.totalKarma.toLocaleString()} karma · Lv.{row.karma.level} {row.karma.levelName}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
