"use client";

import { useEffect, useState } from "react";
import { LibraryBig, MessageSquare, Trophy } from "lucide-react";
import HomepageCarouselSection from "@/components/homepage/carousel/HomepageCarouselSection";
import HomepageCarouselItem from "@/components/homepage/carousel/HomepageCarouselItem";
import HomepageCollectionCarouselCard from "@/components/homepage/cards/HomepageCollectionCarouselCard";
import HomepageCommentCarouselCard from "@/components/homepage/cards/HomepageCommentCarouselCard";
import HomepageCommenterCarouselCard from "@/components/homepage/cards/HomepageCommenterCarouselCard";
import HomepageCarouselEmpty from "@/components/homepage/community/HomepageCarouselEmpty";
import HomepageSectionLink from "@/components/homepage/community/HomepageSectionLink";
import { HOMEPAGE_CAROUSEL_LIMIT, HOMEPAGE_COMMENT_CAROUSEL_ITEM_CLASS, HOMEPAGE_COMMENTER_CAROUSEL_ITEM_CLASS } from "@/constants/homepage";
import { scheduleCarouselPrefetch } from "@/lib/coverImageCache";
import { getCardCoverUrl } from "@/lib/coverUtils";
import * as homeService from "@/services/homeService";
import { getCollections } from "@/services/mangaService";

type CollectionEntry = [string, { description?: string; topManga?: { cover?: unknown }[] }];

export default function HomepageCommunitySection() {
  const [collections, setCollections] = useState<CollectionEntry[]>([]);
  const [recentComments, setRecentComments] = useState<any[]>([]);
  const [topCommenters, setTopCommenters] = useState<any[]>([]);

  useEffect(() => {
    getCollections()
      .then((data) => setCollections(Object.entries(data ?? {})))
      .catch(() => setCollections([]));
    homeService.getRecentComments(HOMEPAGE_CAROUSEL_LIMIT).then(setRecentComments).catch(() => setRecentComments([]));
    homeService.getTopCommenters(HOMEPAGE_CAROUSEL_LIMIT).then(setTopCommenters).catch(() => setTopCommenters([]));
  }, []);

  useEffect(() => {
    if (collections.length === 0) return;
    scheduleCarouselPrefetch(
      collections.map(([, data]) => getCardCoverUrl(data.topManga?.[0]?.cover)),
    );
  }, [collections]);

  return (
    <div className="space-y-16">
      {collections.length === 0 ? (
        <HomepageCarouselEmpty title="Collections" icon={LibraryBig} message="No collections available yet." />
      ) : (
        <HomepageCarouselSection title="Collections" headerTrailing={<HomepageSectionLink href="/collections" label="View all" />}>
          {collections.map(([genre, data]) => (
            <HomepageCarouselItem key={`collection-${genre}`}>
              <HomepageCollectionCarouselCard collection={{ name: genre, description: data.description, topManga: data.topManga }} />
            </HomepageCarouselItem>
          ))}
        </HomepageCarouselSection>
      )}

      {topCommenters.length === 0 ? (
        <HomepageCarouselEmpty title="Top Commenters" icon={Trophy} message="No rankings yet." />
      ) : (
        <HomepageCarouselSection title="Top Commenters" headerTrailing={<HomepageSectionLink href="/leaderboard" label="View leaderboard" />}>
          {topCommenters.map((user, index) => (
            <HomepageCarouselItem key={user.id} className={HOMEPAGE_COMMENTER_CAROUSEL_ITEM_CLASS}>
              <HomepageCommenterCarouselCard user={user} rank={index + 1} />
            </HomepageCarouselItem>
          ))}
        </HomepageCarouselSection>
      )}

      {recentComments.length === 0 ? (
        <HomepageCarouselEmpty title="Recent Comments" icon={MessageSquare} message="No comments yet. Be the first to join the discussion." />
      ) : (
        <HomepageCarouselSection title="Recent Comments" headerTrailing={<HomepageSectionLink href="/leaderboard" label="View leaderboard" />}>
          {recentComments.map((comment) => (
            <HomepageCarouselItem key={comment.id} className={HOMEPAGE_COMMENT_CAROUSEL_ITEM_CLASS}>
              <HomepageCommentCarouselCard comment={comment} />
            </HomepageCarouselItem>
          ))}
        </HomepageCarouselSection>
      )}
    </div>
  );
}
