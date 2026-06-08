import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import SavedListsClient from "../components/SavedListsClient";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Saved Lists",
  description: "Manga lists you have saved.",
  path: "/lists/saved",
  noIndex: true,
});

export default function SavedListsPage() {
  return (
    <>
      <PageHeader title="Saved Lists" description="Lists you have bookmarked." />
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <SavedListsClient />
      </div>
    </>
  );
}
