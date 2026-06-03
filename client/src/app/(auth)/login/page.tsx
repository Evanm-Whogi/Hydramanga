import type { Metadata } from "next";
import LoginContent from "./components/LoginContent";
import { getSiteSettings } from "@/services/siteSettingsService";

export const metadata: Metadata = {
  title: `Login - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Login to your account to start reading manga.",
  openGraph: {
    title: `Login - ${process.env.NEXT_PUBLIC_NAME}`,
    description: "Access your manga reading lists and preferences",
    type: "website",
  },
};

export default async function LoginPage() {
  const siteSettings = await getSiteSettings();
  return (
    <LoginContent
      oauthGoogleEnabled={siteSettings.oauthGoogleEnabled}
      oauthDiscordEnabled={siteSettings.oauthDiscordEnabled}
    />
  );
}
