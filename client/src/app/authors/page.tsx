import { Suspense } from "react";
import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import AuthorsClient from "./components/AuthorsClient";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Authors",
  description: "Browse manga authors and discover their works.",
  path: "/authors",
  noIndex: true,
});

export default function AuthorsPage() {
  return (
    <>
      <PageHeader title="Authors" description="Browse manga authors and discover their works." />
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <Suspense fallback={<div className="p-4 text-center text-muted">Loading authors...</div>}>
          <AuthorsClient />
        </Suspense>
      </div>
    </>
  );
}
