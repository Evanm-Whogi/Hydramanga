import type { Metadata } from "next";
import { fetchMangaMetadata } from '@/services/mangaService';
import ReadContent from './components/ReadContent';

interface Props {
  params: Promise<{ id: string; chapterId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id, chapterId } = await params;
    const manga = await fetchMangaMetadata(id);

    return {
      title: `Chapter ${chapterId} - ${manga.title} - ${process.env.NEXT_PUBLIC_NAME}`,
      description: `Read Chapter ${chapterId} of ${manga.title} on ${process.env.NEXT_PUBLIC_NAME}`,
      openGraph: {
        title: `Chapter ${chapterId} - ${manga.title}`,
        description: `Reading ${manga.title} Chapter ${chapterId}`,
        images: [
          {
            url: manga.cover?.raw?.url || manga.cover?.x350?.x3 || '',
            alt: manga.title,
          },
        ],
        type: "website",
      },
    };
  } catch (error) {
    return {
      title: `Read Manga - ${process.env.NEXT_PUBLIC_NAME}`,
      description: "Read manga chapters on " + process.env.NEXT_PUBLIC_NAME,
    };
  }
}

export default async function ReadPage({ params }: Props) {
  const { id } = await params;
  
  try {
    const manga = await fetchMangaMetadata(id);
    return <ReadContent mangaTitle={manga.title} />;
  } catch (error) {
    // For bots/crawlers that can't access the content, return nothing
    // The metadata has already been generated and embedded in the HTML
    // Just return a minimal component - bots won't see this anyway
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }
}