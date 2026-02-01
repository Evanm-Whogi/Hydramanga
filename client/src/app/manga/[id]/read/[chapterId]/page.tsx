import type { Metadata } from "next";
import { fetchOne } from '@/services/mangaService';
import ReadContent from './components/ReadContent';

interface Props {
  params: Promise<{ id: string; chapterId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id, chapterId } = await params;
    const data = await fetchOne(id);
    const manga = data.manga;

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
    const data = await fetchOne(id);
    const manga = data.manga;
    
    // If no chapters (bot received minimal data), show fallback
    if (!manga.chapters) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted">Content unavailable</p>
        </div>
      );
    }
    
    return <ReadContent mangaTitle={manga.title} />;
  } catch (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Content unavailable</p>
      </div>
    );
  }
}