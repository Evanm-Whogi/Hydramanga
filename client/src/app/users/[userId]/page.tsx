import type { Metadata } from "next";
import UserProfileClient from "./UserProfileClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Profile - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "View user profile",
};

export default async function UserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <UserProfileClient userId={userId} />;
}
