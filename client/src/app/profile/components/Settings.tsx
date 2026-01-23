'use client';
import Image from "next/image"
import InputField from "@/components/InputField"
import SingleCheckbox from "@/components/layout/SingleCheckbox";
import { useEffect, useState } from "react";
import { updateUser, changeEmail, changePassword, sendVerificationEmail, signOut, useSession, listSessions, revokeSession } from "@/lib/auth";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";

export default function Settings({user}: {user: any}) {
    const [name, setName] = useState(user.name);
    const [email, setEmail] = useState(user.email);
    const [avatarUrl, setAvatarUrl] = useState(user.image || "");
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [sessions, setSessions] = useState<any[]>([]);
    const { data: activeSession } = useSession();
    const router = useRouter();

    // Fetch Sessions
    const fetchSessions = async () => {
        const { data, error } = await listSessions();
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
            fetchSessions(); // Refresh list
        } catch (err: any) {
            toast.error(err.message);
        }
    };
    
    // Update profile info (name, email, avatar)
    const handleUpdateInfo = async () => {
        try {
            // Update Name first if it changed
            if (name !== user.name) {
                const { error: nameError } = await updateUser({ name: name });
                if (nameError) throw new Error(nameError.message);
                router.refresh();
            }

            // Update Avatar if it changed
            if (avatarUrl && avatarUrl !== user.image) {
                const { error: imageError } = await updateUser({ image: avatarUrl });
                if (imageError) throw new Error(imageError.message);
                router.refresh();
            }

            // Handle Email change separately
            if (email !== user.email) {
                const { error: emailError } = await changeEmail({
                    newEmail: email,
                });
                if (emailError) throw new Error(emailError.message);
                toast.success("Information updated. Please check your new email to verify the change.");
                router.refresh();
            } else {
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
                email: email,
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
        const { data, error } = await changePassword({
            newPassword: newPassword,
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
        <>
        <div className="flex flex-col">
            <div className="flex flex-col md:flex-row w-full gap-6">
                <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md">
                <h1 className="text-xl font-bold">Basic Info</h1>
                <p className="text-sm text-gray-400">Update your basic profile information such as username and email address.</p>
                    <div className="flex flex-col pt-5 grow">
                        <div className="flex flex-col space-y-3 grow">
                            <InputField label="Username" placeholder={user.name} value={name} onChange={(e: any) => setName(e.target.value)} />
                            <InputField label="Email" placeholder={user.email} value={email} onChange={(e: any) => setEmail(e.target.value)} />
                            <InputField label="Avatar URL" placeholder="https://..." value={avatarUrl} onChange={(e: any) => setAvatarUrl(e.target.value)} />
                            <div className="flex items-center gap-3 pt-1">
                                <div className="w-14 h-14 rounded-md overflow-hidden border border-borders bg-background">
                                    {/* Using img tag for user-provided URLs; Next.js Image requires domain config */}
                                    <img src={avatarUrl || user.image || '/default-avatar.jpg'} alt="avatar preview" className="w-full h-full object-cover" />
                                </div>
                                <p className="text-xs text-muted">Paste an image URL (square works best).</p>
                            </div>
                            {/* <div className="flex place-content-between pt-2">
                                <SingleCheckbox label="Private Profile" description="Hide your profile from discovery" onChange={() => {}} />
                                <SingleCheckbox label="Allow NSFW" description="Enable or Disable Pornography/Erotic Categories" onChange={() => {}} />
                            </div> */}
                        </div>
                        <button onClick={handleUpdateInfo} className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer mt-5">Save</button>
                    </div>
                </div>
                <div className="flex flex-col p-5 bg-foreground w-full md:w-1/2 rounded-md">
                    <h1 className="text-xl font-bold">Change Password</h1>
                    <p className="text-sm text-gray-400">Update your account password to keep your account secure.</p>
                    <div className="flex flex-col pt-5 grow">
                        <div className="flex flex-col space-y-3 grow">
                            <InputField label="Old Password" placeholder="******" value={oldPassword} onChange={(e: any) => setOldPassword(e.target.value)} type="password"/>
                            <InputField label="New Password" placeholder="******" value={newPassword} onChange={(e: any) => setNewPassword(e.target.value)} type="password"/>
                        </div>
                        <button onClick={handleChangePassword} className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer mt-5">Save</button>
                    </div>
                </div>
            </div>
            <div className="container my-5 bg-foreground rounded-md px-5">
                <div className="flex flex-col md:flex-row w-full py-5 items-center place-content-evenly gap-6">
                    <button onClick={handleResendVerification} className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer w-full md:w-1/2">Resend Email Verification</button>
                    <button className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer w-full md:w-1/2 text-red-500">Delete Account</button>
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
                                        IP: {session.ipAddress || "Unknown"} &#8226;
                                        Last active: {new Date(session.updatedAt).toLocaleDateString()}
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
        </>
    )
}