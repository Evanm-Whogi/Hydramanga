import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import RequestContent from "./components/RequestContent";

export const metadata: Metadata = {
  title: `Request Import - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Request a manga series to be imported.",
  openGraph: {
    title: `Request Import - ${process.env.NEXT_PUBLIC_NAME}`,
    description: "Request a manga series to be imported.",
    type: "website",
  },
};

export default function RequestPage() {
  return (
    <>
      <PageHeader title="Request Import" description="Ask us to import a manga that is not available yet."/>
      <div className="container mx-auto text-primary flex flex-col pt-[6vh] min-h-[65vh] pb-12">
        <RequestContent />
      </div>
    </>
  );
}
