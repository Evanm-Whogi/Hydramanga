import type { Metadata } from "next";
import { getHeroManga } from "@/services/homeService";
import HomepageHero from "@/components/homepage/HomepageHero";
import HomepageClient from "@/components/homepage/HomepageClient";
import JsonLd from "@/components/JsonLd";
import { buildHomePageJsonLd, buildPageMetadata, getSiteConfig } from "@/lib/seo";

const site = getSiteConfig();

export const metadata: Metadata = buildPageMetadata({
  title: `${site.name} - Home`,
  description: "Continue reading, discover trending manga, and see what the community is talking about.",
  path: "/",
  absoluteTitle: true,
});

export default async function HomePage() {
  const heroManga = await getHeroManga("week", 6, 6);

  return (
    <>
      <JsonLd data={buildHomePageJsonLd()} />
      <HomepageHero mangaData={heroManga || []} />
      <HomepageClient />
    </>
  );
}
