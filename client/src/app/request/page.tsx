import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import RequestContent from "./components/RequestContent";
import { getSiteSettings } from "@/services/siteSettingsService";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Request Import',
  description: 'Request a manga, manhwa, or manhua series to be added to the HydraManga catalog.',
  path: '/request',
});

export default async function RequestPage() {
  const siteSettings = await getSiteSettings();
  return (
    <>
      <PageHeader title="Request Import" description="Ask us to import a manga that is not available yet."/>
      <div className="container mx-auto text-primary flex flex-col pt-[6vh] min-h-[65vh] pb-12">
        <RequestContent importRequestsEnabled={siteSettings.importRequestsEnabled} />
      </div>
    </>
  );
}
