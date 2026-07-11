import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Server Error",
  description: "The server is temporarily unavailable.",
  path: "/error-500",
  noIndex: true,
});

export default function Error500Layout({ children }: { children: React.ReactNode }) {
  return children;
}
