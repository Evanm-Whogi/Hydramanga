import { redirect } from "next/navigation";
import { useSession } from "@/lib/useUser";
import AdminLayoutShell from "@/app/admin/AdminLayoutShell";

/** Server-side admin gate — one getSession per admin page (not per proxy hit). */
export default async function AdminLayout({children}: {children: React.ReactNode;}) {
    const session = await useSession();

    if (!session?.user) {
        redirect("/login");
    }

    if (session.user.role !== "admin") {
        redirect("/home");
    }

    return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
