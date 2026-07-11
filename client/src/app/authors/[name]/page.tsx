import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAuthorDetail } from "@/services/authorService";
import AuthorDetailClient from "./components/AuthorDetailClient";
import { buildPageMetadata, getSiteConfig } from "@/lib/seo";
import { authorPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ name: string }>;
}

const getCachedAuthorDetail = cache(async (name: string) => fetchAuthorDetail(name));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { name } = await params;
    const decoded = decodeURIComponent(name);
    const detail = await getCachedAuthorDetail(decoded);
    const { name: siteName } = getSiteConfig();
    return buildPageMetadata({
      title: detail.name,
      description: `Manga and works by ${detail.name} on ${siteName}.`,
      path: authorPath(detail.name),
      includeSiteKeywords: false,
    });
  } catch {
    return buildPageMetadata({ title: "Author", description: "Manga author", path: "/authors" });
  }
}

export default async function AuthorDetailPage({ params }: Props) {
  const { name } = await params;
  try {
    const detail = await getCachedAuthorDetail(decodeURIComponent(name));
    return <AuthorDetailClient detail={detail} />;
  } catch {
    notFound();
  }
}
