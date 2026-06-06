import type { Metadata } from "next";
import { getPopularManga } from '@/services/homeService';
import Lists from "./components/Lists";
import Hero from './components/Hero';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Home',
    description: 'Explore trending manga, continue reading, and see what the HydraManga community is enjoying right now.',
    path: '/home',
  });
}

export default async function Home() {
  const highScores = await getPopularManga();

  return (
    <>
      <Hero mangaData={highScores || []} />
      <Lists />
    </>
  )
}
