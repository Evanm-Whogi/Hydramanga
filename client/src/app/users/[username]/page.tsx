import type { Metadata } from "next";
import UserProfileClient from "./UserProfileClient";
import { getPublicProfile } from "@/services/profileService";
import { buildPageMetadata, getSiteConfig, truncateDescription } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const identifier = decodeURIComponent(username);
  const { name: siteName } = getSiteConfig();

  if (identifier === "me") {
    return buildPageMetadata({
      title: "My Profile",
      description: `Your ${siteName} profile.`,
      path: "/users/me",
      noIndex: true,
    });
  }

  try {
    const { profile } = await getPublicProfile(identifier);
    const display = profile.username || profile.name || identifier;
    const isPrivate = profile.isPrivate || profile.isProfilePublic === false;
    const description = truncateDescription(profile.bio) || `${display}'s profile on ${siteName}`;
    return buildPageMetadata({
      title: display,
      description,
      path: `/users/${encodeURIComponent(profile.username || identifier)}`,
      noIndex: isPrivate,
      images: profile.image ? [{ url: profile.image, alt: display }] : undefined,
      includeSiteKeywords: false,
    });
  } catch {
    return buildPageMetadata({
      title: "Profile",
      description: `User profile on ${siteName}`,
      path: `/users/${encodeURIComponent(identifier)}`,
      noIndex: true,
    });
  }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;
  return <UserProfileClient identifier={decodeURIComponent(username)} />;
}
