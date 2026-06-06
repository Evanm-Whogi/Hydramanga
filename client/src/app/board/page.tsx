import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import BoardClient from "./BoardClient";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Community Board',
  description: 'Discuss manga, share theories, and join community conversations on the HydraManga board.',
  path: '/board',
});

export default function BoardPage() {
  return (
    <>
      <PageHeader title="Community Board" description="Post, reply, and vote on community discussions" />
      <BoardClient />
    </>
  );
}
