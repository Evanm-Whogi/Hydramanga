import type { Metadata } from "next";
import ProfileContent from "./components/ProfileContent";

export const metadata: Metadata = {
  title: `Profile - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "View and manage your profile on " + process.env.NEXT_PUBLIC_NAME,
  openGraph: {
    title: `Profile - ${process.env.NEXT_PUBLIC_NAME}`,
    description: "Manage your manga reading lists and preferences",
    type: "website",
  },
};

export default async function ProfilePage() {
  return <ProfileContent  />;
}