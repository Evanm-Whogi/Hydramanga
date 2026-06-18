import { Suspense } from "react";
import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import ForumClient from "./ForumClient";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Forum',
  description: 'Discuss manga, share theories, and join community conversations on the HydraManga forum.',
  path: '/forum',
});

export const dynamic = 'force-dynamic';

export default function ForumPage() {
  return (
    <>
      <PageHeader title="Forum" description="Post, reply, and vote on community discussions" />
      <Suspense fallback={<div className="container mx-auto px-4 xl:px-0 py-8 text-muted text-sm">Loading…</div>}>
        <ForumClient />
      </Suspense>
    </>
  );
}
