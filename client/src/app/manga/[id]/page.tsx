import type { Metadata } from "next";
import { fetchMangaMetadata, fetchOne } from '@/services/mangaService';
import MangaContent from './components/MangaContent';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const manga = await fetchMangaMetadata(id);

    return {
      title: `${manga.title} - ${process.env.NEXT_PUBLIC_NAME}`,
      description: manga.description?.substring(0, 160) || `Read ${manga.title} on ${process.env.NEXT_PUBLIC_NAME}`,
      openGraph: {
        title: `${manga.title} - ${process.env.NEXT_PUBLIC_NAME}`,
        description: manga.description?.substring(0, 160) || `Discover ${manga.title}`,
        images: [
          {
            url: manga.cover?.raw?.url || manga.cover?.x350?.x3 || '',
            alt: manga.title,
          },
        ],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: `${manga.title} - ${process.env.NEXT_PUBLIC_NAME}`,
        description: manga.description?.substring(0, 160) || `Read ${manga.title} on ${process.env.NEXT_PUBLIC_NAME}`,
        images: [manga.cover?.raw?.url || manga.cover?.x350?.x3 || `${process.env.NEXT_PUBLIC_URL}/logo.png`],
      },
    };
  } catch (error) {
    return {
      title: `Manga - ${process.env.NEXT_PUBLIC_NAME}`,
      description: "Read manga on " + process.env.NEXT_PUBLIC_NAME,
    };
  }
}

export default async function MangaPage({ params }: Props) {
  const { id } = await params;
  
  try {
    const data = await fetchOne(id);
    // Map server-side list info to a simple display name for the client dropdown
    const initialListName = data.userStatus?.listName ?? null;
    return <MangaContent manga={data.manga} initialListName={initialListName} />;
  } catch (error) {
    // For bots/crawlers that can't access the content, return minimal UI
    // The metadata has already been generated and embedded in the HTML
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Content unavailable</p>
      </div>
    );
  }
}