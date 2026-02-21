'use client';
import InputField from "@/components/InputField";
import { useEffect, useState, useRef } from "react";
import { updateUser, changeEmail, changePassword, sendVerificationEmail, signOut, useSession, listSessions, revokeSession } from "@/lib/auth";
import { uploadProfilePicture, deleteProfilePicture } from "@/services/userService";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { trackAuthEvent } from "@/lib/analytics";
import { Upload, X } from "lucide-react";

export default function Settings({ user }: { user: any }) {
    const router = useRouter();
    const { data: activeSession } = useSession();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(user.name);
    const [email, setEmail] = useState(user.email);
    const [avatarUrl, setAvatarUrl] = useState(user.image || "");
    const [previewUrl, setPreviewUrl] = useState(user.image || "");
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [sessions, setSessions] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

    // Handle file selection
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) return toast.error('Only JPEG, PNG, GIF, and WebP images are allowed');

        // Validate file size (5MB)
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) return toast.error('File size must be less than 5MB');

        setSelectedFile(file);

        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    // Handle profile picture upload
    const handleUploadProfilePicture = async () => {
        if (!selectedFile) return toast.error('Please select a file');

        setUploading(true);
        try {
            const data = await uploadProfilePicture(selectedFile);
            toast.success('Profile picture uploaded successfully!');
            setSelectedFile(null);
            setAvatarUrl(data.image);
            setPreviewUrl(data.image);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            // Refresh user state across the app
            await updateUser({ image: data.image });
        } catch (err: any) {
            toast.error(err.message || 'Failed to upload profile picture');
        } finally {
            setUploading(false);
        }
    };

    // Handle profile picture deletion
    const handleDeleteProfilePicture = async () => {
        if (confirm('Are you sure you want to delete your profile picture?')) {
            try {
                const data = await deleteProfilePicture();
                toast.success('Profile picture deleted successfully!');
                setAvatarUrl(data.image);
                setPreviewUrl(data.image);
                setSelectedFile(null);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
                // Refresh user state across the app
                await updateUser({ image: data.image });
            } catch (err: any) {
                toast.error(err.message || 'Failed to delete profile picture');
            }
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
                            
                            <div className="flex flex-col space-y-2">
                                <label className="text-sm font-semibold text-primary">Profile Picture</label>
                                <div className="flex items-center gap-4">
                                    <div className="w-20 h-20 rounded-md overflow-hidden border border-borders bg-background">
                                        <img src={previewUrl || user.image || '/default-avatar.jpg'} alt="avatar preview" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/gif,image/webp"
                                            onChange={handleFileSelect}
                                            className="hidden"
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading}
                                            className="flex items-center gap-2 bg-background hover:bg-background/50 disabled:opacity-50 px-3 py-2 rounded-lg text-sm hover:cursor-pointer transition-colors"
                                        >
                                            <Upload className="size-4" />
                                            Choose Image
                                        </button>
                                        {selectedFile && (
                                            <button
                                                onClick={handleUploadProfilePicture}
                                                disabled={uploading}
                                                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-2 rounded-lg text-sm text-white hover:cursor-pointer transition-colors"
                                            >
                                                {uploading ? 'Uploading...' : 'Upload'}
                                            </button>
                                        )}
                                        {!avatarUrl.startsWith('/default') && avatarUrl && (
                                            <button
                                                onClick={handleDeleteProfilePicture}
                                                disabled={uploading}
                                                className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 px-3 py-2 rounded-lg text-sm text-red-500 hover:cursor-pointer transition-colors"
                                            >
                                                <X className="size-4" />
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-muted">JPEG, PNG, GIF, or WebP. Max 5MB.</p>
                            </div>
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
            <div className="container my-5 bg-foreground rounded-md px-5">
                <div className="flex flex-col md:flex-row w-full py-5 items-center place-content-evenly gap-6">
                    <button
                        onClick={handleResendVerification}
                        className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer w-full md:w-1/2"
                    >
                        Resend Email Verification
                    </button>
                    <button className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer w-full md:w-1/2 text-red-500">
                        Delete Account
                    </button>
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