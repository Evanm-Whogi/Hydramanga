'use client';
import InputField from "@/components/InputField";
import { useEffect, useState } from "react";
import { updateUser, changeEmail, changePassword, sendVerificationEmail, signOut, useSession, listSessions, revokeSession } from "@/lib/auth";
import { getSettings, updateSettings } from "@/services/userService";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { trackAuthEvent } from "@/lib/analytics";

export default function Settings({ user }: { user: any }) {
    const router = useRouter();
    const { data: activeSession } = useSession();
    const [name, setName] = useState(user.name);
    const [email, setEmail] = useState(user.email);
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [sessions, setSessions] = useState<any[]>([]);
    const [hideNsfw, setHideNsfw] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);

    // Fetch user settings (NSFW preference)
    const fetchSettings = async () => {
        try {
            const s = await getSettings();
            setHideNsfw(s.hideNsfw);
        } catch {
            setHideNsfw(false);
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
        } catch {
            toast.error("Failed to update setting");
        } finally {
            setSettingsLoading(false);
        }
    };

    // Fetch Sessions
    const fetchSessions = async () => {
        const { data } = await listSessions();
        if (data) setSessions(data);
    };

    useEffect(() => {
        fetchSessions();
    }, []);
    const handleRevokeSession = async (token: string) => {
        try {
            const { error } = await revokeSession({ token });
            if (error) throw new Error(error.message);
            toast.success("Session revoked");
            fetchSessions();
        } catch (err: any) {
            toast.error(err.message);
        }
    };
    // Update profile info
    const handleUpdateInfo = async () => {
        try {
            if (name !== user.name) {
                const { error } = await updateUser({ name });
                if (error) throw new Error(error.message);
                router.refresh();
            }

            if (email !== user.email) {
                const { error } = await changeEmail({ newEmail: email });
                if (error) throw new Error(error.message);
                toast.success("Information updated. Please check your new email to verify the change.");
                router.refresh();
            } else if (name !== user.name) {
                toast.success("Profile updated successfully!");
                router.refresh();
            }
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    // Send Email Verification
    const handleResendVerification = async () => {
        try {
            const { error } = await sendVerificationEmail({
                email,
                callbackURL: window.location.origin + "/profile?verified=true",
            });

            if (error) throw new Error(error.message);
            toast.success("Verification email resent! Please check your inbox.");
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    // Change Password
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
                        trackAuthEvent('logout', user?.id, user?.email, user?.name);
                        router.push('/');
                        router.refresh();
                        toast('See you next time.', { type: 'info' });
                    },
                },
            });
        }
    };

    return (
        <div className="flex flex-col">
            <div className="flex flex-col md:flex-row w-full gap-6">
                <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md">
                    <h1 className="text-xl font-bold">Basic Info</h1>
                    <p className="text-sm text-gray-400">Update your basic profile information such as username and email address.</p>
                    <div className="flex flex-col pt-5 grow">
                        <div className="flex flex-col space-y-3 grow">
                            <InputField label="Username" placeholder={user.name} value={name} onChange={(e: any) => setName(e.target.value)} />
                            <InputField label="Email" placeholder={user.email} value={email} onChange={(e: any) => setEmail(e.target.value)} />
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
                    <p className="text-sm text-gray-400">Update your account password to keep your account secure.</p>
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

            <div className="flex flex-col md:flex-row w-full gap-6 mt-5">
                <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md">
                    <h1 className="text-xl font-bold">Content</h1>
                    <p className="text-sm text-gray-400 mb-4">Control what content appears across the site (home, discover, etc.).</p>
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
                </div>
                <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md space-y-3">
                    <h1 className="text-xl font-bold">Danger Zone</h1>
                        <p className="text-sm text-gray-400 mb-4">Be careful with these actions. They cannot be undone.</p>
                        <div className="flex items-center justify-between gap-4">
                            <button onClick={handleResendVerification} className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer w-full">
                                Resend Email Verification
                            </button>
                            <button className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer w-full text-red-500">
                                Delete Account
                            </button>
                        </div>
                </div>
            </div>

            <div className="flex flex-col w-full my-5 bg-foreground p-5 rounded-md">
                <h1 className="text-xl font-bold">Active Sessions</h1>
                <p className="text-sm text-gray-400 mb-4">Manage and revoke your active sessions across different devices.</p>
                
                <div className="flex flex-col space-y-3">
                    {sessions.map((session) => (
                        <div key={session.id} className="flex items-center justify-between bg-background/50 p-4 rounded-lg border border-white/5">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-background rounded-full">
                                    {/* Simple logic to show a generic icon or text */}
                                    <span className="text-xs uppercase font-bold">{session.userAgent?.includes("Windows") ? "Win" : "Mob"}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-medium">
                                        {session.userAgent || "Unknown Device"}
                                        {session.id === activeSession?.session.id && (
                                            <span className="ml-2 text-xs bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full">Current</span>
                                        )}
                                    </span>
                                    <div className="text-xs text-gray-400">
                                        IP: {session.ipAddress || "Unknown"} &#8226; Last active: {new Date(session.updatedAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>

                            {session.id !== activeSession?.session.id && (
                                <button onClick={() => handleRevokeSession(session.token)} className="text-sm text-red-500 hover:text-red-400 font-medium">Revoke</button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}