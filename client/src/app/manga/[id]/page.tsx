import type { Metadata } from "next";
import { fetchOne, fetchGallery } from '@/services/mangaService';
import MangaContent from './components/MangaContent';
import JsonLd from '@/components/JsonLd';
import { buildComicSeriesJsonLd, buildPageMetadata, getSiteConfig, truncateDescription } from '@/lib/seo';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const data = await fetchOne(id);
    const manga = data.manga;
    const hasImportedChapters = Array.isArray(manga.chapters) && manga.chapters.length > 0;
    const description = truncateDescription(manga.description) || `Read ${manga.title} on ${getSiteConfig().name}`;
    const coverUrl = manga.cover?.raw?.url || manga.cover?.x350?.x3 || undefined;

    return buildPageMetadata({
      title: manga.title,
      description,
      path: `/manga/${id}`,
      noIndex: !hasImportedChapters,
      images: coverUrl ? [{ url: coverUrl, alt: manga.title }] : undefined,
      includeSiteKeywords: false,
    });
  } catch {
    return buildPageMetadata({
      title: 'Manga',
      description: `Read manga on ${getSiteConfig().name}`,
      path: '/discover',
      noIndex: true,
    });
  }
}

export default async function MangaPage({ params }: Props) {
    const { id } = await params;
    const data = await fetchOne(id);
    const gallery = await fetchGallery(id);
    const manga = data.manga;
    const hasImportedChapters = Array.isArray(manga.chapters) && manga.chapters.length > 0;
    const coverUrl = manga.cover?.raw?.url || manga.cover?.x350?.x3 || undefined;
    const initialBookmarkStatus = data.userStatus?.status ?? null;

    return (
      <>
        {hasImportedChapters ? (
          <JsonLd data={buildComicSeriesJsonLd({ id: manga.id, title: manga.title, description: manga.description, coverUrl })} />
        ) : null}
        <MangaContent manga={manga} gallery={gallery} initialBookmarkStatus={initialBookmarkStatus} />
      </>
    );
}
