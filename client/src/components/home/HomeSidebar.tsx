"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { ArrowRight, MessageSquare, Trophy } from "lucide-react";
import * as homeService from "@/services/homeService";
import PwaInstallCard from "./sidebar/PwaInstallCard";
import DiscordCard from "./sidebar/DiscordCard";
import SidebarCommentItem from "./sidebar/SidebarCommentItem";
import TopCommenterItem from "./sidebar/TopCommenterItem";

const COMMENT_LIMIT = 8;
const COMMENTER_LIMIT = 10;

function SidebarPanel({title, icon: Icon, href, children, emptyMessage, isEmpty}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  children: React.ReactNode;
  emptyMessage: string;
  isEmpty: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-borders bg-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-borders px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-white" />
          <h2 className="text-sm font-semibold text-primary">{title}</h2>
        </div>
        {href && (
          <Link href={href} className="inline-flex items-center gap-0.5 text-xs text-muted transition-colors hover:text-accent">
            View all
            <ArrowRight className="size-3" />
          </Link>
        )}
      </div>
      {isEmpty ? (
        <p className="px-4 py-6 text-center text-sm text-muted">{emptyMessage}</p>
      ) : (
        <div className="divide-y divide-borders">{children}</div>
      )}
    </section>
  );
}

export default function HomeSidebar() {
  const [recentComments, setRecentComments] = useState<any[]>([]);
  const [topCommenters, setTopCommenters] = useState<any[]>([]);

  useEffect(() => {
    homeService.getRecentComments(COMMENT_LIMIT).then(setRecentComments).catch(() => setRecentComments([]));
    homeService.getTopCommenters(COMMENTER_LIMIT).then(setTopCommenters).catch(() => setTopCommenters([]));
  }, []);

  return (
    <aside className="flex w-full flex-col gap-4 xl:sticky xl:top-24 xl:self-start">
      <div className="flex flex-col gap-3">
        <PwaInstallCard />
        <DiscordCard />
      </div>

      <SidebarPanel
        title="Recent Comments"
        icon={MessageSquare}
        href="/leaderboard"
        isEmpty={recentComments.length === 0}
        emptyMessage="No comments yet. Be the first to join the discussion."
      >
        {recentComments.map((comment) => (
          <SidebarCommentItem key={comment.id} comment={comment} />
        ))}
      </SidebarPanel>

      <SidebarPanel
        title="Top Commenters"
        icon={Trophy}
        href="/leaderboard"
        isEmpty={topCommenters.length === 0}
        emptyMessage="No rankings yet."
      >
        {topCommenters.map((user, index) => (
          <TopCommenterItem key={user.id} user={user} rank={index + 1} />
        ))}
      </SidebarPanel>
    </aside>
  );
}
