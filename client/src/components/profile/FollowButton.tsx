"use client";

import { useState } from "react";
import { UserPlus, UserCheck, Flag } from "lucide-react";
import { toast } from "react-toastify";
import { toastApiError } from "@/lib/rateLimit";
import { requireAuth } from "@/lib/requireAuth";
import { useUser } from "@/providers/UserProvider";
import { followUser, unfollowUser } from "@/services/profileService";
import ReportUserModal from "@/app/profile/components/ReportUserModal";

type FollowButtonProps = {
  identifier: string;
  username: string;
  initialIsFollowing: boolean;
  onFollowerCountChange: (count: number) => void;
};

export default function FollowButton({ identifier, username, initialIsFollowing, onFollowerCountChange }: FollowButtonProps) {
  const { user } = useUser();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const handleFollowClick = async () => {
    if (!requireAuth(user, `/users/${encodeURIComponent(identifier)}`)) return;
    setLoading(true);
    try {
      const result = isFollowing ? await unfollowUser(identifier) : await followUser(identifier);
      setIsFollowing(result.isFollowing);
      onFollowerCountChange(result.followerCount);
      toast.success(result.isFollowing ? "You are now following this user" : "Unfollowed");
    } catch (err) {
      toastApiError(err, isFollowing ? "Failed to unfollow" : "Failed to follow");
    } finally {
      setLoading(false);
    }
  };

  const handleReportClick = () => {
    if (!requireAuth(user, `/users/${encodeURIComponent(identifier)}`)) return;
    setShowReport(true);
  };

  return (
    <>
      <div className="mt-4 pt-4 border-t border-borders space-y-2">
        <button
          type="button"
          onClick={handleFollowClick}
          disabled={loading}
          className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
            isFollowing
              ? "bg-background text-primary hover:bg-background/70"
              : "bg-accent text-white hover:bg-accent/90"
          }`}
        >
          {isFollowing ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
          {loading ? "..." : isFollowing ? "Following" : "Follow"}
        </button>
        <button
          type="button"
          onClick={handleReportClick}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-background text-muted hover:text-primary hover:bg-background/70 transition-colors"
        >
          <Flag className="size-4" />
          Report
        </button>
      </div>
      {showReport && <ReportUserModal identifier={identifier} username={username} onClose={() => setShowReport(false)} />}
    </>
  );
}
