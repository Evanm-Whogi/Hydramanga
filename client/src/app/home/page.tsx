import type { Metadata } from "next";
import { getHomepage } from '@/services/mangaService';
import Lists from "./components/Lists";
import Hero from './components/Hero';
import ContinueReading from './components/ContinueReading';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: `Home - ${process.env.NEXT_PUBLIC_NAME}`,
    description: `Explore trending manga and continue reading.`,
    openGraph: {
      title: `Home - ${process.env.NEXT_PUBLIC_NAME}`,
      description: "Discover trending manga and your reading list",
      type: "website",
    },
  };
}

export default async function Home() {
  const mangaData = await getHomepage();

  return (
    <>
      <Hero mangaData={mangaData.trending[0]} />
      <ContinueReading />
      <Lists mangaData={mangaData} />
    </>
  )
}
