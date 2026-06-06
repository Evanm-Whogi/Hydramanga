import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import ContactContent from "@/app/contact/components/ContactContent";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact & DMCA',
  description: 'Contact HydraManga for support, feedback, or DMCA and copyright requests.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <>
      <PageHeader title="Contact & DMCA" description="Send us a message or report a copyright concern." />
      <div className="container mx-auto text-primary flex flex-col pt-[6vh] min-h-[65vh] overflow-hidden">
        <ContactContent />
      </div>
    </>
  );
}
