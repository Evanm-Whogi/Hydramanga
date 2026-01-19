export const dynamic = 'force-dynamic';

import { Bounce, ToastContainer, toast } from 'react-toastify';
import type { Metadata } from "next";
import "@/styles/globals.css";
import { UserProvider } from '@/providers/UserProvider';
import { useSession } from '@/lib/useUser';

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

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
  };
}

export default async function RootLayout({children}: Readonly<{children: React.ReactNode;}>) {
  const session = await useSession();

  // Suppress hydration is due to issues with certain browser extensions (eg. Grammarly) that inject elements into the DOM. This applies to the <html> and <body> tags.
  return (
    <html lang="en" suppressHydrationWarning={true} className="theme-dark">
      <head>
        <script>
          {`
            if (localStorage.getItem('theme')) {
              document.documentElement.className = localStorage.getItem('theme');
            } else {
              document.documentElement.className = 'theme-dark';
            }
          `}
        </script>
      </head>
      <body className="bg-background text-primary min-h-screen flex flex-col" suppressHydrationWarning={true}>
        <UserProvider initialSession={session}>
          <Navbar />
          <main className="flex-1">
              {children}
          </main>
          <Footer />
        </UserProvider>
        <ToastContainer
          position="top-right"
          autoClose={2000}
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
