import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import LeaderboardClient from "./LeaderboardClient";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Leaderboard',
  description: 'See top readers, reviewers, commenters, and streak leaders on HydraManga.',
  path: '/leaderboard',
});

export default function LeaderboardPage() {
  return (
    <>
      <PageHeader title="Leaderboard" description="See who's leading the community" />
      <LeaderboardClient />
    </>
  );
}
