"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutDashboardIcon, MessageSquareIcon, ListIcon, HistoryIcon, MessagesSquareIcon, BookTextIcon } from "lucide-react";
import { getPublicProfile, type PublicProfile } from "@/services/profileService";
import { useUser } from "@/providers/UserProvider";
import Overview from "@/app/profile/components/Overview";
import ProfileContent from "@/app/profile/components/ProfileContent";
import ProfileBadgesCard from "@/components/badges/ProfileBadgesCard";
import FollowButton from "@/components/profile/FollowButton";
import ProfileTabBar from "@/app/profile/components/ProfileTabBar";
import ProfileComments from "@/app/profile/components/ProfileComments";
import ProfileWall from "@/app/profile/components/ProfileWall";
import ProfileLists from "@/app/profile/components/ProfileLists";
import ProfileRecentReads from "@/app/profile/components/ProfileRecentReads";
import BookmarksPageClient from "@/app/bookmarks/components/BookmarksPageClient";
import type { UserKarma } from "@/types/stats";
import type { ProfileVisibility } from "@/types/profile";
import { buildProfileTabs, DEFAULT_PROFILE_VISIBILITY, normalizeProfileTab, type ProfileTabId } from "@/app/profile/profileTabs";
import { formatCompactNumber } from "@/lib/utils";

const TAB_ICONS: Partial<Record<ProfileTabId, React.ReactNode>> = {
  overview: <LayoutDashboardIcon className="size-5" />,
  lists: <ListIcon className="size-5" />,
  bookmarks: <BookTextIcon className="size-5" />,
  comments: <MessageSquareIcon className="size-5" />,
  wall: <MessagesSquareIcon className="size-5" />,
  "recent-reads": <HistoryIcon className="size-5" />,
};

function KarmaCard({ karma }: { karma: UserKarma }) {
  const isMax = karma.karmaForNextLevel === 0 || karma.karmaToNextLevel === 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-primary">Level {karma.level}</h3>
          <p className="text-sm text-muted">{karma.levelName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted uppercase tracking-wide">Total Karma</p>
          <p className="text-base font-semibold text-primary">{karma.totalKarma.toLocaleString()}</p>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-background overflow-hidden">
        <div className="h-full rounded-full bg-linear-to-r from-accent to-primary" style={{ width: `${isMax ? 100 : karma.progressToNextLevel}%` }} />
      </div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unknown" : parsed.toDateString();
}

function PublicProfileView({ identifier }: { identifier: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProfileTabId>(() => normalizeProfileTab(searchParams.get("tab")));

  useEffect(() => {
    getPublicProfile(identifier)
      .then((d) => {
        setProfile(d.profile);
        setFollowerCount(d.profile.followerCount ?? 0);
        setFollowingCount(d.profile.followingCount ?? 0);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [identifier]);

  useEffect(() => {
    setTab(normalizeProfileTab(searchParams.get("tab")));
  }, [searchParams]);

  const visibility = profile?.profileVisibility ?? DEFAULT_PROFILE_VISIBILITY;
  const tabs = useMemo(() => buildProfileTabs(false, visibility, TAB_ICONS), [visibility]);

  const handleTabChange = (nextTab: string) => {
    const normalized = normalizeProfileTab(nextTab);
    setTab(normalized);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", normalized);
    router.replace(`/users/${encodeURIComponent(identifier)}?${params.toString()}`, { scroll: false });
  };

  if (loading) {
    return <div className="container mx-auto py-20 text-center text-muted">Loading profile…</div>;
  }

  if (!profile) {
    router.replace("/not-found");
    return null;
  }

  if (profile.isPrivate) {
    return (
      <div className="container mx-auto py-20 px-4 text-center ">
        <img src={profile.image || "/media/pfp/default.jpg"} alt="" className="w-24 h-24 rounded-full mx-auto mb-4 mt-24" />
        <h1 className="text-2xl font-bold text-primary">{profile.name}</h1>
        <p className="text-muted mt-2">This profile is private.</p>
        {profile.isOwner && (
          <Link href="/users/me?tab=settings" className="text-accent mt-4 inline-block hover:underline">Change visibility in settings</Link>
        )}
      </div>
    );
  }

  const profileIdentifier = profile.username || profile.id;

  const renderTabContent = () => {
    switch (tab) {
      case "overview":
        return (
          <Overview
            user={profile}
            isOwner={false}
            identifier={profileIdentifier}
            profileVisibility={visibility}
            stats={profile.stats}
          />
        );
      case "lists":
        return visibility.lists ? <ProfileLists identifier={profileIdentifier} /> : null;
      case "bookmarks":
        return visibility.bookmarks ? <BookmarksPageClient identifier={profileIdentifier} readOnly /> : null;
      case "comments":
        return visibility.comments ? <ProfileComments identifier={profileIdentifier} /> : null;
      case "wall":
        return visibility.wall ? <ProfileWall identifier={profileIdentifier} wallOwnerId={profile.id} /> : null;
      case "recent-reads":
        return visibility.recentReads ? <ProfileRecentReads identifier={profileIdentifier} /> : null;
      default:
        return (
          <Overview
            user={profile}
            isOwner={false}
            identifier={profileIdentifier}
            profileVisibility={visibility}
            stats={profile.stats}
          />
        );
    }
  };

  return (
    <>
      <div
        className="h-82 z-10 absolute lg:relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:-z-10 before:bg-(image:--manga-cover) before:bg-cover before:bg-center before:brightness-[0.7] before:blur-[6px] before:scale-110"
        style={{ "--manga-cover": `url(${profile.image})` } as React.CSSProperties}
      />
      <div className="container mx-auto pt-5 px-4 xl:px-0 mb-5">
        <div className="flex flex-col lg:flex-row lg:place-content-center">
          <div className="relative mt-25 md:mt-0 md:-top-35 flex flex-col w-full lg:w-80 z-25 items-center lg:items-start">
            <img src={profile.image || "/media/pfp/default.jpg"} alt="" className="w-48 lg:w-full aspect-square object-cover rounded-md border-4 border-background shadow-lg" />
            <div className="bg-foreground rounded-md p-5 w-full mt-5">
              <div className="text-primary">Username: <span className="text-muted ml-2">{profile.name}</span></div>
              {profile.role && <div className="text-primary mt-1">Role: <span className="text-muted ml-2">{profile.role}</span></div>}
              <div className="flex text-primary capitalize">Account Created: <span className="ml-2 text-muted">{new Date(profile?.createdAt!).toDateString()}</span></div>
              <div className="flex text-primary capitalize">Last Online: <span className="ml-2 text-muted">{formatDate(profile?.lastOnlineAt ?? profile?.createdAt)}</span></div>
              <div className="flex text-primary capitalize">Followers: <span className="ml-2 text-muted">{formatCompactNumber(followerCount)}</span></div>
              <div className="flex text-primary capitalize">Following: <span className="ml-2 text-muted">{formatCompactNumber(followingCount)}</span></div>
              {!profile.isOwner && (
                <FollowButton
                  identifier={profileIdentifier}
                  username={profile.name}
                  initialIsFollowing={profile.isFollowing ?? false}
                  onFollowerCountChange={setFollowerCount}
                />
              )}
            </div>
            {profile.stats?.karma && (
              <div className="bg-foreground rounded-md p-5 w-full mt-5">
                <KarmaCard karma={profile.stats.karma} />
              </div>
            )}
            <ProfileBadgesCard
              badges={profile.badges}
              userId={profile.id}
              chaptersRead={typeof profile.stats?.chaptersRead === "number" ? profile.stats.chaptersRead : undefined}
            />
          </div>
          <div className="flex flex-col w-full lg:w-2/3 lg:ml-5 mt-5 lg:mt-0 space-y-4">
            {profile.isOwner && (
              <Link href="/users/me" className="text-accent text-sm hover:underline">Edit your profile →</Link>
            )}
            <ProfileTabBar tabs={tabs} activeTab={tab} onTabChange={handleTabChange} />
            <div className="mt-2">{renderTabContent()}</div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function UserProfileClient({ identifier }: { identifier: string }) {
  const { user: sessionUser } = useUser();
  const handle = sessionUser as { id: string; username?: string | null; displayUsername?: string | null } | null;
  const isSelf = identifier === "me" || (!!handle && (identifier === handle.id || identifier === handle.username || identifier === handle.displayUsername));

  if (isSelf) return <ProfileContent />;
  return <PublicProfileView identifier={identifier} />;
}
