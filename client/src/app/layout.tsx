import { Bounce, ToastContainer, toast } from 'react-toastify';
import "@/styles/globals.css";
import JsonLd from '@/components/JsonLd';
import { buildRootMetadata, buildWebsiteJsonLd } from '@/lib/seo';
import { UserProvider } from '@/providers/UserProvider';
import { NotificationsProvider } from '@/providers/NotificationsProvider';
import { useSession } from '@/lib/useUser';
import { cookies } from 'next/headers';
import Script from "next/script"

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WelcomeModalGate from "@/components/WelcomeModalGate";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import BannedSessionGuard from "@/components/BannedSessionGuard";
import DevToolsGuardScript from "@/components/DevToolsGuardScript";
import MaintenanceGate from "@/components/MaintenanceGate";
import { getSiteSettings } from "@/services/siteSettingsService";

export async function generateMetadata() {
  return buildRootMetadata();
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
        <JsonLd data={buildWebsiteJsonLd()} />
        <link rel="preconnect" href="https://cdn.mangabaka.dev" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.mangabaka.dev" crossOrigin="anonymous" />
      </head>
      <body className="bg-background text-primary min-h-screen flex flex-col" suppressHydrationWarning={true}>
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
        <Script
          src="https://tracking.chit.sh/api/script.js"
          data-site-id="3622d35d4d54"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
