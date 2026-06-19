"use client";

import { useCallback, useEffect, useState } from "react";
import {Search, ChevronLeft, ChevronRight, Loader2, Shield, ShieldOff, EllipsisVertical, Ban} from "lucide-react";
import { isUserBanned } from "@/lib/banHelpers";
import { toast } from "react-toastify";
import { listAdminUsers, type AdminUser, type ListAdminUsersParams} from "@/services/adminUserService";
import AdminUserEditModal from "./AdminUserEditModal";
import UserAvatar from "@/components/UserAvatar";

const ROLE_FILTERS: { value: ListAdminUsersParams["role"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admins" },
  { value: "user", label: "Users" },
];

const STATUS_FILTERS: { value: ListAdminUsersParams["status"]; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "banned", label: "Banned" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function UsersClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<ListAdminUsersParams["role"]>("all");
  const [statusFilter, setStatusFilter] = useState<ListAdminUsersParams["status"]>("all");
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAdminUsers({
        page,
        limit: 20,
        search: search || undefined,
        role: roleFilter,
        status: statusFilter,
      });
      setUsers(result.users);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
          <input
            type="search"
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-foreground border border-borders text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div className="flex flex-wrap gap-6 justify-end">
          <div className="gap-2 flex flex-row">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={`status-${value}`}
                type="button"
                onClick={() => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  statusFilter === value
                    ? "bg-accent text-white border-accent"
                    : "bg-foreground text-muted border-borders hover:text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="gap-2 flex flex-row">
          {ROLE_FILTERS.map(({ value, label }) => (
            <button
              key={`role-${value}`}
              type="button"
              onClick={() => {
                setRoleFilter(value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                roleFilter === value
                  ? "bg-accent text-white border-accent"
                  : "bg-foreground text-muted border-borders hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted">
        {total} user{total !== 1 ? "s" : ""} total
      </p>

      <div className="bg-foreground rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borders bg-background/50">
                <th className="px-4 py-3 font-semibold text-muted">User</th>
                <th className="px-4 py-3 font-semibold text-muted">Email</th>
                <th className="px-4 py-3 font-semibold text-muted">Role</th>
                <th className="px-4 py-3 font-semibold text-muted">Level</th>
                <th className="px-4 py-3 font-semibold text-muted">XP</th>
                <th className="px-4 py-3 font-semibold text-muted">Joined</th>
                <th className="px-4 py-3 font-semibold text-muted">Last Online</th>
                <th className="px-4 py-3 font-semibold text-muted">Verified</th>
                <th className="px-4 py-3 font-semibold text-muted">Status</th>
                <th className="px-4 py-3 font-semibold text-muted w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted">
                    <Loader2 className="size-6 animate-spin inline-block mr-2" />
                    Loading users…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-borders hover:bg-background50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar src={user.image} alt="" width={40} className="border border-borders" />
                        <span className="font-medium text-primary truncate">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted truncate max-w-50">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          user.role === "admin"
                            ? "bg-accent/20 text-accent"
                            : "bg-background text-muted"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-primary font-medium">Lv. {user.xp.level}</span>
                        <span className="text-xs text-muted">{user.xp.levelName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-primary">{user.xp.totalXp.toLocaleString()} karma</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {formatDate(user.lastOnlineAt ?? user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {user.emailVerified ? (
                        <span className="inline-flex items-center gap-1 text-green-400 text-xs">
                          <Shield className="size-3.5" /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted text-xs">
                          <ShieldOff className="size-3.5" /> No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isUserBanned(user) ? (
                        <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                          <Ban className="size-3.5" /> Banned
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingUser(user)}
                        className="p-2 rounded-lg text-muted hover:text-primary hover:bg-background border border-transparent hover:border-borders transition-colors hover:cursor-pointer"
                        aria-label={`Edit ${user.name}`}
                      >
                        <EllipsisVertical className="size-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-foreground border border-borders text-primary disabled:opacity-50 hover:bg-foreground/80"
          >
            <ChevronLeft className="size-4" /> Previous
          </button>
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground border border-borders text-primary disabled:opacity-50 hover:bg-foreground/80"
          >
            Next <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      {editingUser && (
        <AdminUserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
          }}
        />
      )}
    </div>
  );
}
