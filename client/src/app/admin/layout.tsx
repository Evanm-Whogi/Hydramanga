"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {LayoutDashboard, Users, BookOpen, Inbox, ListOrdered, Settings} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import AdminGuard from "@/app/admin/components/AdminGuard";

const NAV_ITEMS = [
  { href: "/admin/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/manga", label: "Manga", icon: BookOpen },
  { href: "/admin/imports", label: "Imports", icon: Inbox },
  { href: "/admin/queues", label: "Queues", icon: ListOrdered },
] as const;

const PAGE_HEADERS: Record<string, { title: string; description: string }> = {
  "/admin/overview": {
    title: "Admin Overview",
    description: "Site health and metrics at a glance",
  },
  "/admin/users": {
    title: "Users",
    description: "Manage accounts, roles, and levels",
  },
  "/admin/manga": {
    title: "Manga",
    description: "Recently imported series and import status",
  },
  "/admin/imports": {
    title: "Import Requests",
    description: "Review and process user import requests",
  },
  "/admin/queues": {
    title: "Queues",
    description: "Job queue health and backlog overview",
  },
};

const tabClass = (active: boolean) =>
  `${active ? "bg-accent text-white" : "bg-foreground text-muted hover:text-primary"} inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-borders`;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const header = PAGE_HEADERS[pathname] ?? {
    title: "Admin",
    description: "Site administration",
  };

  return (
    <AdminGuard>
      <PageHeader title={header.title} description={header.description} />
      <div className="container mx-auto py-6">
        <nav className="flex flex-wrap gap-2 p-2 bg-background rounded-xl" aria-label="Admin sections">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={tabClass(active)}>
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="container mx-auto pb-8 lg:pb-12">{children}</div>
    </AdminGuard>
  );
}
