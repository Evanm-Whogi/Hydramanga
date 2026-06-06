import type { Metadata } from "next";
import LoginContent from "./components/LoginContent";
import { getSiteSettings } from "@/services/siteSettingsService";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Login',
  description: 'Sign in to HydraManga to track your reading lists, earn badges, and join the community.',
  path: '/login',
  noIndex: true,
});

export default async function LoginPage() {
  const siteSettings = await getSiteSettings();
  return (
    <LoginContent
      oauthGoogleEnabled={siteSettings.oauthGoogleEnabled}
      oauthDiscordEnabled={siteSettings.oauthDiscordEnabled}
    />
  );
}
