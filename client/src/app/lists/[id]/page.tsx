import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchListDetail, fetchListComments } from "@/services/curatedListService";
import ListDetailClient from "./components/ListDetailClient";
import { buildPageMetadata, getSiteConfig } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const getCachedListDetail = cache(async (id: string) => fetchListDetail(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const data = await getCachedListDetail(id);
    const { name } = getSiteConfig();
    return buildPageMetadata({
      title: data.list.title,
      description: data.list.description || `A curated manga list on ${name}`,
      path: `/lists/${id}`,
      noIndex: data.list.visibility === "private",
    });
  } catch {
    return buildPageMetadata({ title: "List", description: "Curated manga list", path: "/lists" });
  }
}

export default async function ListDetailPage({ params }: Props) {
  const { id } = await params;
  try {
    const [detail, commentsData] = await Promise.all([
      getCachedListDetail(id),
      fetchListComments(Number(id), { sort: "recent", page: 1, limit: 50 }).catch(() => ({ comments: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } })),
    ]);
    return (
      <ListDetailClient
        list={detail.list}
        initialComments={commentsData.comments}
        initialPagination={commentsData.pagination}
      />
    );
  } catch {
    notFound();
  }
}
