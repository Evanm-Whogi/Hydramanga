import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import ChatClient from "./ChatClient";

export const metadata: Metadata = {
  title: `Community Chat - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Real-time community chat",
};

export default function ChatPage() {
  return (
    <>
      <PageHeader title="Community Chat" description="Chat with other readers in real time" />
      <ChatClient />
    </>
  );
}
