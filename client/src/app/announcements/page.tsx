import type { Metadata } from "next";
import { getAnnouncements } from "@/services/announcementService";
import PageHeader from "@/components/PageHeader";
import AnnouncementsView from "./AnnouncementsView";

export const metadata: Metadata = {
  title: `Announcements - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Stay updated with the latest news and updates about your favorite manga.",
  openGraph: {
    title: `Announcements - ${process.env.NEXT_PUBLIC_NAME}`,
    description: "Latest news and announcements",
    type: "website",
  },
};

export default async function Announcements() {
  const announcements = await getAnnouncements();

  return (
    <>
      <PageHeader title="Latest Announcements" description="Stay updated with the latest news and updates" />
      <AnnouncementsView announcements={announcements} />
    </>
  );
}