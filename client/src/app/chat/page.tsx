import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import ChatClient from "./ChatClient";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Community Chat',
  description: 'Chat with other manga readers in real time on HydraManga.',
  path: '/chat',
  noIndex: true,
});

export default function ChatPage() {
  return (
    <>
      <PageHeader title="Community Chat" description="Chat with other readers in real time" />
      <ChatClient />
    </>
  );
}
