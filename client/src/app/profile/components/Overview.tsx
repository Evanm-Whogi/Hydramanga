'use client';

import { useState } from "react";
import { updateUser } from "@/lib/auth";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import ReadingStats from "./ReadingStats";

export default function Overview({ user, isOwner }: { user: any; isOwner: boolean }) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [bio, setBio] = useState(user.bio || "");

    const handleSaveBio = async () => {
        try {
            const { error } = await updateUser({ bio });
            if (error) throw new Error(error.message);
            
            toast.success("Bio updated!");
            setIsEditing(false);
            router.refresh();
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    return (
        <div className="flex flex-col w-full space-y-6">
            {/* Bio Section */}
            <div className="bg-foreground rounded-lg p-6">
                <h3 className="text-xl font-bold text-primary mb-3">About</h3>
                {isEditing ? (
                    <div className="flex flex-col w-full gap-2">
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            className="w-full p-3 bg-background rounded-md border border-white/10 outline-none focus:ring-1 focus:ring-white/20 h-24 resize-none"
                            placeholder="Write something about yourself..."
                        />
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={handleSaveBio}
                                className="px-3 py-1 bg-white text-black rounded-md text-sm font-medium hover:bg-gray-200">
                                Save
                            </button>
                            <button
                                onClick={() => { setIsEditing(false); setBio(user.bio); }}
                                className="px-3 py-1 bg-background rounded-md text-sm font-medium hover:bg-background/50">
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="group relative w-full">
                        <p className="text-gray-300">{user.bio || <span className="italic text-gray-500">No bio yet...</span>}</p>
                        
                        {isOwner && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-background rounded-md"
                                title="Edit Bio">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                    <path d="m15 5 4 4"/>
                                </svg>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Reading Statistics */}
            <ReadingStats />
        </div>
    );
}