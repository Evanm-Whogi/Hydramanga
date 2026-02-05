import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import ContactContent from "@/app/contact/components/ContactContent";

export const metadata: Metadata = {
  title: `Contact - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Contact us for support, feedback, or DMCA requests.",
  openGraph: {
    title: `Contact - ${process.env.NEXT_PUBLIC_NAME}`,
    description: "Contact us for support, feedback, or DMCA requests.",
    type: "website",
  },
};

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
