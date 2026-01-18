"use server";
import Hero from './components/Hero';
import Lists from './components/Lists';
import type { Metadata } from "next";
import ContinueReading from './components/ContinueReading';
import { getHomepage } from '@/services/mangaService';

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
        <Lists mangaData={mangaData}/>
    </>
  );
}
