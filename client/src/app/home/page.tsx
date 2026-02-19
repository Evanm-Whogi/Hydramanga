import type { Metadata } from "next";
import {getHighScores} from '@/services/homeService';
import Lists from "./components/Lists";
import Hero from './components/Hero';

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
  const highScores = await getHighScores();

  return (
    <>
      <Hero mangaData={highScores[0]} />
      <Lists />
    </>
  )
}
