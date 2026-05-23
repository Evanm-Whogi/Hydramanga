"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPublicProfile, type PublicProfile } from "@/services/profileService";
import { useUser } from "@/providers/UserProvider";
import Overview from "@/app/profile/components/Overview";
import type { UserKarma } from "@/types/stats";

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
        <div
          className="h-full rounded-full bg-linear-to-r from-accent to-primary"
          style={{ width: `${isMax ? 100 : karma.progressToNextLevel}%` }}
        />
      </div>
    </div>
  );
}

export default function UserProfileClient({ userId }: { userId: string }) {
  const { user: sessionUser } = useUser();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicProfile(userId)
      .then((d) => setProfile(d.profile))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="container mx-auto py-20 text-center text-muted">
        Loading profile…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto py-20 text-center text-muted">
        User not found.
      </div>
    );
  }

  if (profile.isPrivate) {
    return (
      <div className="container mx-auto py-20 px-4 text-center">
        <img src={profile.image || "/default-avatar.jpg"} alt="" className="w-24 h-24 rounded-full mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-primary">{profile.name}</h1>
        <p className="text-muted mt-2">This profile is private.</p>
        {sessionUser?.id === userId && (
          <Link href="/profile?tab=settings" className="text-accent mt-4 inline-block hover:underline">
            Change visibility in settings
          </Link>
        )}
      </div>
    );
  }

  const isOwner = profile.isOwner ?? sessionUser?.id === userId;

  return (
    <>
      <div
        className="h-82 z-10 absolute lg:relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:-z-10 before:bg-(image:--manga-cover) before:bg-cover before:bg-center before:brightness-[0.7] before:blur-[6px] before:scale-110"
        style={{ "--manga-cover": `url(${profile.image})` } as React.CSSProperties}
      />
      <div className="container mx-auto pt-5 px-4 xl:px-0 mb-5">
        <div className="flex flex-col lg:flex-row lg:place-content-center">
          <div className="relative mt-25 md:mt-0 md:-top-35 flex flex-col w-full lg:w-80 z-25 items-center lg:items-start">
            <img
              src={profile.image || "/default-avatar.jpg"}
              alt=""
              className="w-48 lg:w-full aspect-square object-cover rounded-md border-4 border-background shadow-lg"
            />
            <div className="bg-foreground rounded-md p-5 w-full mt-5">
              <div className="text-primary">
                Username: <span className="text-muted ml-2">{profile.name}</span>
              </div>
              {profile.role && (
                <div className="text-primary mt-1">
                  Role: <span className="text-muted ml-2">{profile.role}</span>
                </div>
              )}
              <div className="flex text-primary capitalize">
                Account Created: <span className="ml-2 text-muted">{new Date(profile?.createdAt!).toDateString()}</span>
              </div>
              <div className="flex text-primary capitalize">
                Last Online: <span className="ml-2 text-muted">{new Date(profile?.createdAt!).toDateString()}</span>
              </div>
            </div>
            {profile.stats?.karma && (
              <div className="bg-foreground rounded-md p-5 w-full mt-5">
                <KarmaCard karma={profile.stats.karma} />
              </div>
            )}
          </div>
          <div className="flex flex-col w-full lg:w-2/3 lg:ml-5 mt-5 lg:mt-0 space-y-4">
            {isOwner && (
              <Link href="/profile" className="text-accent text-sm hover:underline">
                Edit your profile →
              </Link>
            )}
            {profile.bio !== undefined && (
              <Overview user={{ ...profile, bio: profile.bio }} isOwner={false} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
