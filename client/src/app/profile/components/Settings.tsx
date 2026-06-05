'use client';
import InputField from "@/components/InputField";
import { useEffect, useState } from "react";
import { updateUser, changeEmail, changePassword, sendVerificationEmail, signOut } from "@/lib/auth";
import { getSettings, updateSettings } from "@/services/userService";
import { toast } from "react-toastify";
import { toastApiError } from "@/lib/rateLimit";
import { useRouter } from "next/navigation";
import { getUserDisplayName } from "@/lib/userDisplay";
import DataExportSection from "@/app/profile/components/DataExportSection";

export default function Settings({ user }: { user: any }) {
  const router = useRouter();
  const [username, setUsername] = useState(user.username ?? user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [hideNsfw, setHideNsfw] = useState(false);
    const [isProfilePublic, setIsProfilePublic] = useState(true);
    const [incognitoMode, setIncognitoMode] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);

  const fetchSettings = async () => {
    try {
      const s = await getSettings();
      setHideNsfw(s.hideNsfw);
      setIsProfilePublic(s.isProfilePublic);
      setIncognitoMode(s.incognitoMode ?? false);
    } catch {
      setHideNsfw(false);
      setIsProfilePublic(true);
      setIncognitoMode(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

    const handleNsfwToggle = async () => {
        const newValue = !hideNsfw;
        setSettingsLoading(true);
        try {
            await updateSettings({ hideNsfw: newValue });
            setHideNsfw(newValue);
            toast.success(newValue ? "NSFW content hidden" : "NSFW content visible");
            router.refresh();
        } catch (error) {
            toastApiError(error, "Failed to update setting");
        } finally {
            setSettingsLoading(false);
        }
    };

    const handleProfilePublicToggle = async () => {
        const newValue = !isProfilePublic;
        setSettingsLoading(true);
        try {
            await updateSettings({ isProfilePublic: newValue });
            setIsProfilePublic(newValue);
            toast.success(newValue ? "Profile is now public" : "Profile is now private");
            router.refresh();
        } catch (error) {
            toastApiError(error, "Failed to update setting");
        } finally {
            setSettingsLoading(false);
        }
    };

    const handleIncognitoToggle = async () => {
        const newValue = !incognitoMode;
        setSettingsLoading(true);
        try {
            await updateSettings({ incognitoMode: newValue });
            setIncognitoMode(newValue);
            toast.success(
              newValue
                ? "Incognito mode enabled. View and reading history won't be saved."
                : "Incognito mode disabled. History tracking resumed."
            );
            router.refresh();
        } catch (error) {
            toastApiError(error, "Failed to update setting");
        } finally {
            setSettingsLoading(false);
        }
    };

  const handleUpdateInfo = async () => {
    try {
      const usernameChanged = username !== (user.username ?? user.name ?? "");
      const emailChanged = email !== (user.email ?? "");

      if (usernameChanged) {
        const { error } = await updateUser({ username: username.trim() });
        if (error) throw new Error(error.message);
      }
      if (emailChanged) {
        const { error } = await changeEmail({ newEmail: email });
        if (error) throw new Error(error.message);
        toast.success("Please check your new email to verify the change.");
      } else if (usernameChanged) {
        toast.success("Profile updated successfully!");
      }
      if (usernameChanged || emailChanged) router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    }
  };

  const handleResendVerification = async () => {
    try {
      const { error } = await sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/users/me?verified=true`,
      });
      if (error) throw new Error(error.message);
      toast.success("Verification email resent! Please check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend verification");
    }
  };

  const handleChangePassword = async () => {
        const { error } = await changePassword({
            newPassword,
            currentPassword: oldPassword,
            revokeOtherSessions: true,
        });

        if (error) {
            toast.error(error.message);
        } else {
            toast.success("Password changed successfully");
            await signOut({
                fetchOptions: {
                    onSuccess: () => {
                        router.push('/');
                        router.refresh();
                        toast('See you next time.', { type: 'info' });
                    },
                },
            });
        }
    };

    return (
        <div className="flex flex-col mb-12">
            <div className="flex flex-col md:flex-row w-full gap-6">
                <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md">
                    <h1 className="text-xl font-bold">Basic Info</h1>
                    <p className="text-sm text-muted">Update your basic profile information such as username and email address.</p>
                    <div className="flex flex-col pt-5 grow">
                        <div className="flex flex-col space-y-3 grow">
                            <InputField label="Username" placeholder={getUserDisplayName(user)} value={username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} />
                            <InputField label="Email" placeholder={user.email ?? undefined} value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
                            <p className="text-sm text-muted">To change your profile picture, click your avatar on the profile page.</p>
                        </div>
                        <button
                            onClick={handleUpdateInfo}
                            className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer mt-5"
                        >
                            Save
                        </button>
                    </div>
                </div>
                <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md">
                    <h1 className="text-xl font-bold">Change Password</h1>
                    <p className="text-sm text-muted">Update your account password to keep your account secure.</p>
                    <div className="flex flex-col pt-5 grow">
                        <div className="flex flex-col space-y-3 grow">
                            <InputField label="Old Password" placeholder="******" value={oldPassword} onChange={(e: any) => setOldPassword(e.target.value)} type="password" />
                            <InputField label="New Password" placeholder="******" value={newPassword} onChange={(e: any) => setNewPassword(e.target.value)} type="password" />
                        </div>
                        <button
                            onClick={handleChangePassword}
                            className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer mt-5"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6 mt-5 w-full">
                <div className="flex flex-col p-5 bg-foreground w-full rounded-md">
                    <h1 className="text-xl font-bold">Content</h1>
                    <p className="text-sm text-muted mb-4">Control what content appears across the site (home, discover, etc.).</p>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="font-medium text-primary">Hide NSFW content</p>
                            <p className="text-sm text-muted">When on, manga with adult ratings or genres (e.g. hentai, erotica) are hidden.</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={hideNsfw}
                            disabled={settingsLoading}
                            onClick={handleNsfwToggle}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${hideNsfw ? 'bg-accent' : 'bg-foreground'}`}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${hideNsfw ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 mt-6 pt-6 border-t border-borders">
                        <div>
                            <p className="font-medium text-primary">Public profile</p>
                            <p className="text-sm text-muted">When on, other members can view your reading stats and karma on your profile page.</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={isProfilePublic}
                            disabled={settingsLoading}
                            onClick={handleProfilePublicToggle}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${isProfilePublic ? 'bg-accent' : 'bg-foreground'}`}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${isProfilePublic ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 mt-6 pt-6 border-t border-borders">
                        <div>
                            <p className="font-medium text-primary">Incognito mode</p>
                            <p className="text-sm text-muted">When on, new manga views and reading history won't be saved until you turn it off.</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={incognitoMode}
                            disabled={settingsLoading}
                            onClick={handleIncognitoToggle}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${incognitoMode ? 'bg-accent' : 'bg-foreground'}`}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${incognitoMode ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex flex-row gap-6 w-full mt-5">
                    <DataExportSection />
                    <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md">
                        <h1 className="text-xl font-bold">Danger Zone</h1>
                        <p className="text-sm text-muted">Be careful with these actions. They cannot be undone.</p>
                        <div className="flex flex-col gap-3 pt-5">
                             <button onClick={handleResendVerification} className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer w-full">
                                Resend Email Verification
                            </button>
                            <button className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer w-full text-red-500">
                                Delete Account
                            </button>
                        </div>
                    </div>
                </div>
        </div>
    );
}