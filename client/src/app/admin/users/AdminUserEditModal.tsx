"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import Input from "@/components/InputField";
import { updateAdminUser, type AdminUser } from "@/services/adminUserService";

interface AdminUserEditModalProps {
  user: AdminUser;
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
}

export default function AdminUserEditModal({ user, onClose, onSaved }: AdminUserEditModalProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<"user" | "admin">(user.role === "admin" ? "admin" : "user");
  const [bio, setBio] = useState(user.bio ?? "");
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [image, setImage] = useState(user.image ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateAdminUser(user.id, {
        name: name.trim(),
        email: email.trim(),
        role,
        bio: bio.trim() || null,
        emailVerified,
        image: image.trim() || null,
      });
      toast.success(`Updated ${updated.name}`);
      onSaved(updated);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update user";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-foreground border border-borders rounded-lg shadow-xl w-1/2 max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-borders sticky top-0 bg-foreground z-10">
          <h2 className="text-lg font-semibold text-primary">Edit user</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md text-muted hover:text-primary hover:bg-background transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4 pb-2 border-b border-borders">
            <img
              src={image || "/default-avatar.jpg"}
              alt=""
              width={64}
              height={64}
              className="rounded-full border border-borders object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/default-avatar.jpg";
              }}
            />
            <div className="text-sm text-muted space-y-1">
              <p>
                <span className="text-primary my-1 text-xl">{user.name}<br/></span>
                <span className="text-primary font-medium">Level {user.xp.level}</span>
                <span className="px-2">·</span>
                {user.xp.levelName}
                <span className="px-2">·</span>
                {user.xp.totalXp.toLocaleString()} XP
              </p>
              <p className="text-xs">ID: {user.id}</p>
            </div>
          </div>


          <div className="flex flex-row gap-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-row gap-4">
            <Input
              label="Profile image URL"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="/default-avatar.jpg or https://…"
            />

            <div className="flex flex-col gap-1.5 w-full">
                <label className="text-sm font-medium text-muted ml-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "user" | "admin")}
                  className="w-full bg-foreground border border-borders text-primary px-4 py-2.5 rounded-xl outline-none focus:border-borders focus:ring-1 focus:ring-borders"
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
            </div>
          </div>


          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-sm font-medium text-muted ml-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full bg-foreground border border-borders text-primary px-4 py-2.5 rounded-xl outline-none resize-y focus:border-borders focus:ring-1 focus:ring-borders"
              placeholder="Optional bio"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={emailVerified}
              onChange={(e) => setEmailVerified(e.target.checked)}
              className="size-4 rounded border-borders accent-accent"
            />
            <span className="text-sm text-primary">Email verified</span>
          </label>

          <p className="text-xs text-muted">
            Joined {new Date(user.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-borders sticky bottom-0 bg-foreground">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-borders text-muted hover:text-primary transition-colors disabled:opacity-50 hover:cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || !email.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2 hover:cursor-pointer"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
