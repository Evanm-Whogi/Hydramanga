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
    const description = truncateDescription(manga.description) || `Read ${manga.title} on ${getSiteConfig().name}`;
    const coverUrl = manga.cover?.raw?.url || manga.cover?.x350?.x3 || undefined;

    return buildPageMetadata({
      title: manga.title,
      description,
      path: `/manga/${id}`,
      images: coverUrl ? [{ url: coverUrl, alt: manga.title }] : undefined,
    });
  } catch {
    return buildPageMetadata({
      title: 'Manga',
      description: `Read manga on ${getSiteConfig().name}`,
      path: '/discover',
    });
  }
}

export default async function MangaPage({ params }: Props) {
    const { id } = await params;
    const data = await fetchOne(id);
    const gallery = await fetchGallery(id);
    const manga = data.manga;
    const coverUrl = manga.cover?.raw?.url || manga.cover?.x350?.x3 || undefined;
    const initialListName = data.userStatus?.listName ?? null;

    return (
      <>
        <JsonLd data={buildComicSeriesJsonLd({ id: manga.id, title: manga.title, description: manga.description, coverUrl })} />
        <MangaContent manga={manga} gallery={gallery} initialListName={initialListName} />
      </>
    );
}
