"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Mail, KeyRound, LogIn, Ban, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import Input from "@/components/InputField";
import {
  updateAdminUser,
  sendAdminUserVerificationEmail,
  sendAdminUserPasswordReset,
  banAdminUser,
  unbanAdminUser,
  type AdminUser,
} from "@/services/adminUserService";
import { authClient } from "@/lib/auth";
import { useUser } from "@/providers/UserProvider";
import { BAN_DURATION_OPTIONS, formatBanExpiry, isUserBanned } from "@/lib/banHelpers";

interface AdminUserEditModalProps {
  user: AdminUser;
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
}

export default function AdminUserEditModal({ user, onClose, onSaved }: AdminUserEditModalProps) {
  const { user: currentUser, session } = useUser();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<"user" | "admin">(user.role === "admin" ? "admin" : "user");
  const [bio, setBio] = useState(user.bio ?? "");
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [image, setImage] = useState(user.image ?? "");
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banReasonInput, setBanReasonInput] = useState("");
  const [banDuration, setBanDuration] = useState("");
  const [banState, setBanState] = useState({
    isBanned: user.isBanned,
    banReason: user.banReason,
    banExpires: user.banExpires,
  });

  useEffect(() => {
    setBanState({
      isBanned: user.isBanned,
      banReason: user.banReason,
      banExpires: user.banExpires,
    });
  }, [user.isBanned, user.banReason, user.banExpires]);

  const isSelf = currentUser?.id === user.id;
  const userBanned = isUserBanned(banState);
  const canBan = !isSelf && user.role !== "admin" && !userBanned;
  const isImpersonating = Boolean((session as { impersonatedBy?: string } | null)?.impersonatedBy);
  const canImpersonate = user.role !== "admin" && !isSelf && !isImpersonating && !userBanned;

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

  const handleResendVerification = async () => {
    if (user.emailVerified) return;
    setActionLoading("verification");
    try {
      await sendAdminUserVerificationEmail(user.id);
      toast.success(`Verification email sent to ${user.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send verification email");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!window.confirm(`Send a password reset email to ${user.email}?`)) return;
    setActionLoading("reset");
    try {
      await sendAdminUserPasswordReset(user.id);
      toast.success(`Password reset email sent to ${user.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send password reset");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBan = async () => {
    if (!canBan) return;
    const reason = banReasonInput.trim() || "Banned by administrator";
    const durationLabel = BAN_DURATION_OPTIONS.find((o) => o.value === banDuration)?.label ?? "Permanent";
    if (
      !window.confirm(
        `Ban ${user.name} (${durationLabel})?\n\nReason: ${reason}\n\nThey will be signed out immediately.`
      )
    ) {
      return;
    }
    setActionLoading("ban");
    try {
      const updated = await banAdminUser(user.id, {
        banReason: reason,
        banExpiresIn: banDuration ? Number(banDuration) : undefined,
      });
      toast.success(`${updated.name} has been banned`);
      setBanState({
        isBanned: updated.isBanned,
        banReason: updated.banReason,
        banExpires: updated.banExpires,
      });
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ban user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnban = async () => {
    if (!userBanned) return;
    if (!window.confirm(`Remove the ban for ${user.name}? They will be able to sign in again.`)) return;
    setActionLoading("unban");
    try {
      const updated = await unbanAdminUser(user.id);
      toast.success(`${updated.name} has been unbanned`);
      setBanState({
        isBanned: updated.isBanned,
        banReason: updated.banReason,
        banExpires: updated.banExpires,
      });
      setBanReasonInput("");
      setBanDuration("");
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unban user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleImpersonate = async () => {
    if (!canImpersonate) return;
    if (
      !window.confirm(
        `Sign in as ${user.name} (${user.email})? You will be logged in as this user for up to 1 hour.`
      )
    ) {
      return;
    }
    setActionLoading("impersonate");
    try {
      const { error } = await authClient.admin.impersonateUser({ userId: user.id });
      if (error) throw new Error(error.message);
      toast.success(`Now viewing as ${user.name}`);
      window.location.href = "/home";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to impersonate user");
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-foreground border border-borders rounded-lg shadow-xl  max-h-[90vh] overflow-y-auto"  onClick={(e) => e.stopPropagation()}>
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
                {user.xp.totalXp.toLocaleString()} karma
              </p>
              <p className="text-xs">ID: {user.id}</p>
              <p className="text-xs text-muted">Joined {new Date(user.createdAt).toLocaleString()}</p>
            </div>
          </div>

          {/* Meta */}
          <div className="flex flex-col pb-5 space-y-3">
            <div className="flex flex-col gap-4">
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
          </div>
          
          {/* Moderation */}
          <div className="flex flex-row gap-6">
            <div className={`rounded-lg border p-3 space-y-3 w-1/2 ${userBanned  ? "border-red-500/40 bg-red-500/10" : "border-borders bg-background/30"}`}>
              <h3 className="text-sm font-semibold text-primary inline-flex items-center gap-2">
                {userBanned ? (
                  <>
                    <Ban className="size-4 text-red-400" />
                    Banned
                  </>
                ) : (
                  "Moderation"
                )}
              </h3>
              {userBanned ? (
                <div className="space-y-2 text-sm">
                  <p className="text-primary">
                    <span className="text-muted">Reason:</span> {banState.banReason || "No reason provided"}
                  </p>
                  <p className="text-muted text-xs">
                    Expires: {formatBanExpiry(banState.banExpires)}
                  </p>
                  <button
                    type="button"
                    onClick={handleUnban}
                    disabled={actionLoading !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-green-500/50 text-green-400 hover:bg-green-500/10 disabled:opacity-50 hover:cursor-pointer"
                  >
                    {actionLoading === "unban" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-3.5" />
                    )}
                    Unban user
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-muted ml-1">Ban reason</label>
                    <textarea
                      value={banReasonInput}
                      onChange={(e) => setBanReasonInput(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Optional reason shown to the user"
                      disabled={!canBan || actionLoading !== null}
                      className="w-full bg-foreground border border-borders text-primary px-4 py-2.5 rounded-xl outline-none resize-y disabled:opacity-50"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-muted ml-1">Duration</label>
                    <select
                      value={banDuration}
                      onChange={(e) => setBanDuration(e.target.value)}
                      disabled={!canBan || actionLoading !== null}
                      className="w-full bg-foreground border border-borders text-primary px-4 py-2.5 rounded-xl outline-none disabled:opacity-50"
                    >
                      {BAN_DURATION_OPTIONS.map((opt) => (
                        <option key={opt.label} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleBan}
                    disabled={!canBan || actionLoading !== null}
                    title={
                      isSelf
                        ? "You cannot ban yourself"
                        : user.role === "admin"
                          ? "Admin accounts cannot be banned"
                          : undefined
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 mt-2 text-sm rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer"
                  >
                    {actionLoading === "ban" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Ban className="size-3.5" />
                    )}
                    Ban user
                  </button>
                </div>
              )}
            </div>


            <div className="rounded-lg border border-borders p-3 space-y-2 bg-background/30 w-1/2">
              <h3 className="text-sm font-semibold text-primary">Account actions</h3>
              <p className="text-xs text-muted">Emails are sent to the address on file ({user.email}), not unsaved edits.</p>
              <div className="flex flex-col flex-wrap gap-2 ">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={user.emailVerified || actionLoading !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-borders text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading === "verification" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Mail className="size-3.5" />
                  )}
                  Resend verification
                </button>
                <button
                  type="button"
                  onClick={handleSendPasswordReset}
                  disabled={actionLoading !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-borders text-primary hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading === "reset" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="size-3.5" />
                  )}
                  Send password reset
                </button>
                <button
                  type="button"
                  onClick={handleImpersonate}
                  disabled={!canImpersonate || actionLoading !== null}
                  title={
                    user.role === "admin"
                      ? "Cannot impersonate admin accounts"
                      : isSelf
                        ? "Cannot impersonate yourself"
                        : isImpersonating
                          ? "Exit current impersonation first"
                          : undefined
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading === "impersonate" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <LogIn className="size-3.5" />
                  )}
                  Login as user
                </button>
              </div>
            </div>
          </div>
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
