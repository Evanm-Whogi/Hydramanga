import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { fetchOneForPage } from '@/services/mangaService';
import { useSession } from '@/lib/useUser';
import { getSiteSettings } from '@/services/siteSettingsService';
import ReadContent from './components/ReadContent';
import NsfwBlockedContent from '@/components/NsfwBlockedContent';
import { buildPageMetadata, getSiteConfig } from '@/lib/seo';

interface Props {
  params: Promise<{ id: string; chapterId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id, chapterId } = await params;
    const result = await fetchOneForPage(id);
    if (result.kind === 'nsfw_hidden') {
      return buildPageMetadata({
        title: 'NSFW Title Hidden',
        description: `This title is marked NSFW. Enable NSFW content to view it on ${getSiteConfig().name}.`,
        path: `/manga/${id}/read/${chapterId}`,
        noIndex: true,
      });
    }
    const manga = result.data.manga;
    const coverUrl = manga.cover?.raw?.url || manga.cover?.x350?.x3 || undefined;

    return buildPageMetadata({
      title: `Chapter ${chapterId} - ${manga.title}`,
      description: `Read Chapter ${chapterId} of ${manga.title} on ${getSiteConfig().name}`,
      path: `/manga/${id}/read/${chapterId}`,
      noIndex: true,
      images: coverUrl ? [{ url: coverUrl, alt: manga.title }] : undefined,
      includeSiteKeywords: false,
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
  const [session, siteSettings] = await Promise.all([useSession(), getSiteSettings()]);
  const { id, chapterId } = await params;

  if (!session?.user && !siteSettings.guestReadingEnabled) {
    redirect(`/login?returnTo=${encodeURIComponent(`/manga/${id}/read/${chapterId}`)}`);
  }

  const result = await fetchOneForPage(id);
  if (result.kind === 'nsfw_hidden') {
    return <NsfwBlockedContent />;
  }

  const manga = result.data.manga;

  if (!manga.chapters) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Content unavailable</p>
      </div>
    );
  }

  // The requested chapter may have been deleted (or never existed) while the
  // series still exists. Render a proper 404 instead of an empty reader.
  const chapterExists = manga.chapters.some(
    (chapter: { id: number }) => chapter.id === Number(chapterId)
  );
  if (!chapterExists) {
    notFound();
  }

  return <ReadContent mangaTitle={manga.title} />;
}
