import type { Metadata } from "next";
import RegisterContent from "./components/RegisterContent";
import { getSiteSettings } from "@/services/siteSettingsService";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Sign Up',
  description: 'Create a HydraManga account to track series, earn badges, and join the community.',
  path: '/register',
  noIndex: true,
});

export default async function RegisterPage() {
  const siteSettings = await getSiteSettings();
  return (
    <RegisterContent
      registrationEnabled={siteSettings.registrationEnabled}
      oauthGoogleEnabled={siteSettings.oauthGoogleEnabled}
      oauthDiscordEnabled={siteSettings.oauthDiscordEnabled}
    />
  );
}
