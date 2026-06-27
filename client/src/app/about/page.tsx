import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import AboutContent from "@/app/about/components/AboutContent";
import { buildPageMetadata } from "@/lib/seo";

const SITE_NAME = process.env.NEXT_PUBLIC_NAME ?? "HydraManga";

export const metadata: Metadata = buildPageMetadata({
  title: "About",
  description: `Learn about ${SITE_NAME} — a free, community-driven platform to discover, read, and discuss manga, manhwa, and manhua.`,
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <PageHeader title="About" description={`What ${SITE_NAME} is, how it works, and what you can do here.`} />
      <div className="container mx-auto text-primary flex flex-col pt-[6vh] min-h-[65vh] overflow-hidden">
        <AboutContent />
      </div>
    </>
  );
}
