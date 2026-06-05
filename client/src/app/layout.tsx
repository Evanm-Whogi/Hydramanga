import { Bounce, ToastContainer, toast } from 'react-toastify';
import type { Metadata } from "next";
import "@/styles/globals.css";
import { UserProvider } from '@/providers/UserProvider';
import { NotificationsProvider } from '@/providers/NotificationsProvider';
import { useSession } from '@/lib/useUser';
import { cookies } from 'next/headers';
import { GoogleAnalytics } from '@next/third-parties/google'

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WelcomeModalGate from "@/components/WelcomeModalGate";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import BannedSessionGuard from "@/components/BannedSessionGuard";
import DevToolsGuardScript from "@/components/DevToolsGuardScript";
import MaintenanceGate from "@/components/MaintenanceGate";
import { getSiteSettings } from "@/services/siteSettingsService";

export async function generateMetadata(): Promise<Metadata> {
  const siteConfig = {
    name: process.env.NEXT_PUBLIC_NAME,
    slogan: process.env.NEXT_PUBLIC_SLOGAN,
    description: process.env.NEXT_PUBLIC_DESC,
    url: process.env.NEXT_PUBLIC_URL,
  };

  return {
    title: `${siteConfig.name} - ${siteConfig.slogan}`,
    description: siteConfig.description,
    keywords: ["manga", "reader", "anime", "comics", "webtoons", "mangaplus", "mangadex", "free manga", "online manga", "manga library", "weebcentral"],
    openGraph: {
      title: `${siteConfig.name} - ${siteConfig.slogan}`,
      description: siteConfig.description,
      url: siteConfig.url,
      siteName: siteConfig.name,
      images: [
        {
          url: `${siteConfig.url}/logo.png`,
          width: 1200,
          height: 630,
          alt: siteConfig.name,
        }
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: siteConfig.name,
      description: siteConfig.description,
      images: [`${siteConfig.url}/logo.png`],
    },
    authors: [{ name: "Whogi" }],
    appleWebApp: {
      capable: true,
      title: siteConfig.name,
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon.ico',
      apple: [
        { url: '/pwa/ios/180.png', sizes: '180x180', type: 'image/png' },
        { url: '/pwa/ios/152.png', sizes: '152x152', type: 'image/png' },
        { url: '/pwa/ios/120.png', sizes: '120x120', type: 'image/png' },
      ],
    },
    manifest: '/manifest.json',
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
  const [session, siteSettings] = await Promise.all([useSession(), getSiteSettings()]);
  const cookieStore = await cookies();
  const isAdmin = session?.user?.role === 'admin';
  const themeMode = cookieStore.get('theme-mode')?.value || 'theme-dark';
  const themeAccent = cookieStore.get('theme-accent')?.value;

  return (
    <html lang="en" suppressHydrationWarning={true} className={themeMode} style={themeAccent ? { '--color-accent': themeAccent } as React.CSSProperties : undefined}>
      <head>
        <DevToolsGuardScript />
        <link rel="preconnect" href="https://cdn.mangabaka.dev" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.mangabaka.dev" crossOrigin="anonymous" />
      </head>
      <body className="bg-background text-primary min-h-screen flex flex-col" suppressHydrationWarning={true}>
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID as string} />
        <UserProvider initialSession={session}>
          <NotificationsProvider>
            <ImpersonationBanner />
            <BannedSessionGuard />
            <MaintenanceGate maintenanceMode={siteSettings.maintenanceMode} maintenanceMessage={siteSettings.maintenanceMessage} isAdmin={isAdmin}>
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
              <WelcomeModalGate siteSettings={siteSettings} />
            </MaintenanceGate>
          </NotificationsProvider>
        </UserProvider>
        <ToastContainer
          position="bottom-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick={false}
          rtl={false}
          pauseOnFocusLoss={true}
          draggable
          pauseOnHover
          transition={Bounce}
          theme="dark"
        />
      </body>
    </html>
  );
}
