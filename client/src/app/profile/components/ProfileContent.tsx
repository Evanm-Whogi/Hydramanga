"use client";
import { LayoutDashboardIcon, SettingsIcon, ShieldIcon, Upload, X, Camera } from 'lucide-react';
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from 'react';
import Overview from '@/app/profile/components/Overview';
import Settings from '@/app/profile/components/Settings';
import Activity from '@/app/profile/components/Activity';
import { toast } from 'react-toastify';
import { useUser } from "@/providers/UserProvider";
import { updateUser } from "@/lib/auth";
import { uploadProfilePicture, deleteProfilePicture } from "@/services/userService";
import { getUserStats } from "@/services/mangaService";
import type { UserKarma } from "@/types/stats";
import ProfileShareCard from "@/app/profile/components/ProfileShareCard";


const VIEWS: { [key: string]: React.FC<{ user: any; isOwner: boolean }> } = {
  overview: Overview,
  settings: Settings,
  activity: Activity,
};

const tabButtonClass = (active: boolean) =>
  `${active ? "bg-foreground text-primary border border-borders" : "bg-foreground text-muted"} hover:bg-foreground/50 px-4 py-2 rounded-lg inline-flex items-center text-base lg:text-lg cursor-pointer transition-colors`;

function LevelCard() {
  const [karma, setKarma] = useState<UserKarma | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const data = await getUserStats();
        if (!isMounted) return;
        const karmaData = (data as { stats?: { karma?: UserKarma } })?.stats?.karma;
        if (karmaData) setKarma(karmaData);
      } catch (error) {
        console.error("Failed to load user karma stats", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchStats();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-5 w-24 bg-background rounded animate-pulse" />
        <div className="h-4 w-32 bg-background rounded animate-pulse" />
        <div className="h-3 w-full bg-background rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-accent animate-pulse" />
        </div>
      </div>
    );
  }

  if (!karma) {
    return (
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-primary">Level</h3>
        <p className="text-sm text-muted">Start reading, commenting, and reviewing to earn karma and level up.</p>
      </div>
    );
  }

  const isMaxLevel = karma.karmaForNextLevel === 0 || karma.karmaToNextLevel === 0;

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

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{isMaxLevel ? "Max level reached" : "Level progress"}</span>
          {!isMaxLevel && (
            <span>{Math.round(karma.progressToNextLevel)}%</span>
          )}
        </div>
        <div className="h-2 w-full rounded-full bg-background overflow-hidden">
          <div
            className="h-full rounded-full bg-linear-to-r from-accent to-primary transition-all"
            style={{ width: `${isMaxLevel ? 100 : karma.progressToNextLevel}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted mt-1">
        {isMaxLevel ? (
          <span>You’ve reached the highest level.</span>
        ) : (
          <>
            <span>Karma this level: {karma.currentLevelKarma} / {karma.karmaForNextLevel}</span>
            <span>Karma to next level: {karma.karmaToNextLevel}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function ProfileContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser()!;
  const [page, setPage] = useState(searchParams.get("tab") || "overview");
  const ActiveView = VIEWS[page] || Overview;
  const verified = searchParams.get("verified");
  const tabParam = searchParams.get("tab");

  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState(user?.image || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) return toast.error('Only JPEG, PNG, GIF, and WebP images are allowed');
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) return toast.error('File size must be less than 5MB');
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadProfilePicture = async () => {
    if (!selectedFile) return toast.error('Please select a file');
    setUploading(true);
    try {
      const data = await uploadProfilePicture(selectedFile);
      toast.success('Profile picture uploaded successfully!');
      setSelectedFile(null);
      setPreviewUrl(data.image);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await updateUser({ image: data.image });
      setShowAvatarModal(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProfilePicture = async () => {
    if (!confirm('Are you sure you want to delete your profile picture?')) return;
    try {
      const data = await deleteProfilePicture();
      toast.success('Profile picture deleted successfully!');
      setPreviewUrl(data.image);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await updateUser({ image: data.image });
      setShowAvatarModal(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete profile picture');
    }
  };

  const openAvatarModal = () => {
    setPreviewUrl(user?.image || "");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowAvatarModal(true);
  };

  useEffect(() => {
    if (tabParam && VIEWS[tabParam]) {
      setPage(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (verified === "true") {
      toast.success("Email verified successfully!");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("verified");
      router.replace(`/users/me?${params.toString()}`, { scroll: false });
    }
  }, [verified, searchParams, router]);

  return (
    <>
      <div className="h-82 z-10 absolute lg:relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:-z-10 before:bg-(image:--manga-cover) before:bg-cover before:bg-center before:brightness-[0.7] before:blur-[6px] before:scale-110"
        style={{ '--manga-cover': `url(${user?.image})` } as React.CSSProperties}></div>
      <div className="container mx-auto pt-5 px-4 xl:px-0 mb-5 md:mb-0">
        <div className="flex flex-col lg:flex-row lg:place-content-center">
          <div className="relative mt-25 md:mt-0 md:-top-35 flex flex-col w-full lg:w-80 z-25 items-center lg:items-start">
            <button
              type="button"
              onClick={openAvatarModal}
              className="group relative w-48 lg:w-full aspect-square overflow-hidden rounded-md border-4 border-background shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Change profile picture"
            >
              <img src={user?.image!} alt="profile" className="w-full h-full object-cover pointer-events-none" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="size-12 text-white" strokeWidth={2} />
              </span>
            </button>

            <div className="bg-foreground rounded-md p-5 w-full mt-5">
              <div className="flex flex-col">
                <div className="flex text-primary capitalize">
                  Username: <span className="ml-2 text-muted">{user?.name}</span>
                </div>
                <div className="flex text-primary capitalize">
                  Role: <span className="ml-2 text-muted">{user?.role}</span>
                </div>
                <div className="flex text-primary capitalize">
                  Account Created: <span className="ml-2 text-muted">{new Date(user?.createdAt!).toDateString()}</span>
                </div>
                <div className="flex text-primary capitalize">
                  Last Online: <span className="ml-2 text-muted">{new Date(user?.createdAt!).toDateString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-foreground rounded-md p-5 w-full mt-5">
              <LevelCard />
            </div>

            {(user?.username || user?.id) && (
              <div className="w-full mt-5">
                <ProfileShareCard username={user.username || user.id} />
              </div>
            )}

          </div>
          <div className="flex flex-col space-y-2 w-full lg:w-2/3 lg:ml-5 mt-5 lg:mt-0">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setPage("overview")}
                className={`${
                  page === "overview" ? "bg-foreground text-primary border border-borders" : "bg-foreground text-muted"
                } hover:bg-foreground/50 px-4 py-2 rounded-lg inline-flex items-center text-base lg:text-lg cursor-pointer transition-colors`}
              >
                <LayoutDashboardIcon className="size-5 mr-2" /> Overview
              </button>
              <button
                onClick={() => setPage("settings")}
                className={`${
                  page === "settings" ? "bg-foreground text-primary border border-borders" : "bg-foreground text-muted"
                } hover:bg-foreground/50 px-4 py-2 rounded-lg inline-flex items-center text-base lg:text-lg cursor-pointer transition-colors`}
              >
                <SettingsIcon className="size-5 mr-2" /> Settings
              </button>
              <button
                onClick={() => setPage("activity")}
                className={`${
                  page === "activity" ? "bg-foreground text-primary border border-borders" : "bg-foreground text-muted"
                } hover:bg-foreground/50 px-4 py-2 rounded-lg inline-flex items-center text-base lg:text-lg cursor-pointer transition-colors`}
              >
                <ShieldIcon className="size-5 mr-2" /> Activity
              </button>
            </div>

            <div className="mt-4">
              <ActiveView user={user} isOwner={true} />
            </div>
          </div>
        </div>
      </div>

      {showAvatarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close modal"
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowAvatarModal(false)}
          />
          <div className="relative bg-foreground rounded-lg p-6 w-full max-w-md border border-borders shadow-xl">
            <h2 className="text-xl font-bold text-primary mb-4">Change profile picture</h2>
            <div className="flex flex-col gap-4">
              <div className="w-32 h-32 mx-auto rounded-md overflow-hidden border border-borders bg-background">
                <img src={previewUrl || user?.image || '/default-avatar.jpg'} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 bg-background hover:bg-background/50 disabled:opacity-50 px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  <Upload className="size-4" />
                  Choose Image
                </button>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={handleUploadProfilePicture}
                    disabled={uploading}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-2 rounded-lg text-sm text-white transition-colors"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                )}
                {user?.image && !user.image.startsWith('/default') && (
                  <button
                    type="button"
                    onClick={handleDeleteProfilePicture}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 px-3 py-2 rounded-lg text-sm text-red-500 transition-colors"
                  >
                    <X className="size-4" />
                    Delete
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">JPEG, PNG, GIF, or WebP. Max 5MB.</p>
              <button
                type="button"
                onClick={() => setShowAvatarModal(false)}
                className="mt-2 px-3 py-2 rounded-lg bg-background hover:bg-background/50 text-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
