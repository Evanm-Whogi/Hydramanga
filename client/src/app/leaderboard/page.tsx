import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import LeaderboardClient from "./LeaderboardClient";

export const metadata: Metadata = {
  title: `Leaderboard - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Top commenters, readers, and reading streaks",
};

export default function LeaderboardPage() {
  return (
    <>
      <PageHeader title="Leaderboard" description="See who's leading the community" />
      <LeaderboardClient />
    </>
  );
}
