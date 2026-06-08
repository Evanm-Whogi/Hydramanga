import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { useSession } from "@/lib/useUser";
import AdminLayoutShell from "@/app/admin/AdminLayoutShell";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Admin',
  description: 'HydraManga admin area.',
  path: '/admin',
  noIndex: true,
});

/** Server-side admin gate — one getSession per admin page (not per proxy hit). */
export default async function AdminLayout({children}: {children: React.ReactNode;}) {
    const session = await useSession();

    if (!session?.user) {
        redirect("/login");
    }

    if (session.user.role !== "admin") {
        redirect("/");
    }

    return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
