import { Suspense } from "react";
import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import ListsDiscoverClient from "./components/ListsDiscoverClient";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Lists",
  description: "Browse and discover curated manga lists shared by the community.",
  path: "/lists",
});

export default function ListsPage() {
  return (
    <>
      <PageHeader title="Lists" description="Discover curated manga collections shared by the community." />
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <Suspense fallback={<div className="p-4 text-center text-muted">Loading lists...</div>}>
          <ListsDiscoverClient />
        </Suspense>
      </div>
    </>
  );
}
