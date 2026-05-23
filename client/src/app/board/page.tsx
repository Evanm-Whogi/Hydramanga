import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import BoardClient from "./BoardClient";

export const metadata: Metadata = {
  title: `Community Board - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Discuss manga and more with the community",
};

export default function BoardPage() {
  return (
    <>
      <PageHeader title="Community Board" description="Post, reply, and vote on community discussions" />
      <BoardClient />
    </>
  );
}
