"use server";
import Hero from './components/Hero';
import Lists from './components/Lists';
import ContinueReading from './components/ContinueReading';
import { getHomepage } from '@/services/mangaService';

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
