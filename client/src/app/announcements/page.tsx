import type { Metadata } from "next";
import { getAnnouncements } from "@/services/announcementService";
import PageHeader from "@/components/PageHeader";
import AnnouncementsView from "./AnnouncementsView";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Announcements',
  description: 'Latest news, updates, and announcements from the HydraManga team.',
  path: '/announcements',
});

export default async function Announcements() {
  const announcements = await getAnnouncements();

  return (
    <>
      <PageHeader title="Latest Announcements" description="Stay updated with the latest news and updates" />
      <AnnouncementsView announcements={announcements} />
    </>
  );
}