import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchOne } from '@/services/mangaService';
import { useSession } from '@/lib/useUser';
import ReadContent from './components/ReadContent';
import { buildPageMetadata, getSiteConfig } from '@/lib/seo';

interface Props {
  params: Promise<{ id: string; chapterId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id, chapterId } = await params;
    const data = await fetchOne(id);
    const manga = data.manga;
    const coverUrl = manga.cover?.raw?.url || manga.cover?.x350?.x3 || undefined;

    return buildPageMetadata({
      title: `Chapter ${chapterId} - ${manga.title}`,
      description: `Read Chapter ${chapterId} of ${manga.title} on ${getSiteConfig().name}`,
      path: `/manga/${id}/read/${chapterId}`,
      noIndex: true,
      images: coverUrl ? [{ url: coverUrl, alt: manga.title }] : undefined,
    });
  } catch {
    return buildPageMetadata({
      title: 'Read Manga',
      description: `Read manga chapters on ${getSiteConfig().name}`,
      path: '/discover',
      noIndex: true,
    });
  }
}

export default async function ReadPage({ params }: Props) {
  const session = await useSession();
  const { id, chapterId } = await params;

  if (!session?.user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/manga/${id}/read/${chapterId}`)}`);
  }

  const data = await fetchOne(id);
  const manga = data.manga;

  if (!manga.chapters) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Content unavailable</p>
      </div>
    );
  }

  return <ReadContent mangaTitle={manga.title} />;
}