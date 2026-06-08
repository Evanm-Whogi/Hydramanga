import type { Metadata } from "next";
import { getPopularManga } from '@/services/homeService';
import Lists from "@/components/home/Lists";
import Hero from '@/components/home/Hero';
import JsonLd from '@/components/JsonLd';
import { buildHomePageJsonLd, buildPageMetadata, getSiteConfig } from '@/lib/seo';

const site = getSiteConfig();

export const metadata: Metadata = buildPageMetadata({
  title: `${site.name} - ${site.slogan}`,
  description: 'Explore trending manga, continue reading, and see what the HydraManga community is enjoying right now.',
  path: '/',
  absoluteTitle: true,
});

export default async function HomePage() {
  const highScores = await getPopularManga();

  return (
    <>
      <JsonLd data={buildHomePageJsonLd()} />
      <Hero mangaData={highScores || []} />
      <Lists />
    </>
  );
}
