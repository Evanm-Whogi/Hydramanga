import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import MineListsClient from "../components/MineListsClient";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "My Lists",
  description: "Manage your curated manga lists.",
  path: "/lists/mine",
  noIndex: true,
});

export default function MyListsPage() {
  return (
    <>
      <PageHeader title="My Lists" description="Lists you have created." />
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <MineListsClient />
      </div>
    </>
  );
}
