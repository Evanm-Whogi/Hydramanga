import type { Metadata } from "next";
import { getAnnouncements } from "@/services/announcementService";
import PageHeader from "@/components/PageHeader";

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
      <div className="container mx-auto text-primary flex flex-col pt-[6vh] min-h-[65vh] overflow-hidden">
        <div className="flex flex-col space-y-4">
          {announcements.length === 0 && <p className="text-muted">No new announcements today.</p>}
          {announcements.map((ann: any) => (
            <div key={ann.id} className="bg-foreground p-5 rounded-lg border border-borders flex flex-col">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-bold text-primary">{ann.title}</h3>
                <span className="text-xs text-muted uppercase tracking-widest">{new Date(ann.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="mt-2 text-muted leading-relaxed">{ann.content}</p>
              <div className="mt-3 flex items-center">
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${ann.type === "warning" ? "bg-amber-500/20 text-amber-500" : "bg-blue-500/20 text-blue-500"}`}>
                  {ann.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}