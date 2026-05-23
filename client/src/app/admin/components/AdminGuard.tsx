"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/providers/UserProvider";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/home");
    }
  }, [user, isPending, router]);

  if (isPending) {
    return (
      <div className="container mx-auto py-16">
        <div className="h-8 w-48 bg-foreground rounded animate-pulse mb-4" />
        <div className="h-64 bg-foreground rounded-lg border border-borders animate-pulse" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return <>{children}</>;
}
