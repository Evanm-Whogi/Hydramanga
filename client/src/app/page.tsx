import type { Metadata } from "next";
import { getIndex } from "@/services/mangaService";
import { Star, TrendingUp, PlayIcon, BookMarkedIcon, UsersIcon, MessageCircleIcon } from "lucide-react";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_NAME || "Manga Scrolls",
  description: process.env.NEXT_PUBLIC_DESC || "Your ultimate destination for manga. Discover, read, and share thousands of titles from your favorite genres.",
  openGraph: {
    title: process.env.NEXT_PUBLIC_NAME || "Manga Scrolls",
    description: process.env.NEXT_PUBLIC_SLOGAN || "Read. Enjoy. Repeat.",
    type: "website",
    url: process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
  },
};

export default async function Index() {
  const indexData = await getIndex();

  return (
    <>
      <section id="hero" className="pt-25">
        <div className="container mx-auto text-primary flex flex-col py-[6vh] min-h-[65vh] overflow-hidden">
          <div className="absolute inset-0 -z-50 max-h-[65vh] overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-center scale-100"
              style={{
                backgroundImage: `url('https://a.storyblok.com/f/178900/2000x800/dca56718f6/ef409152bda0452ab6d673416e7554d71663038752_main.jpg/m/filters:quality(95)format(webp)')`,
              }}
            />
            <div className="absolute inset-0 bg-linear-to-r from-background via-background/95 to-background/60" />
            <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-background/80" />
            <div className="absolute top-20 right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-float-aggressive" />
            <div className="absolute bottom-20 left-20 w-64 h-64 bg-accent/20 rounded-full blur-3xl animate-float-aggressive" />
          </div>

          <div className="flex flex-col space-y-4 mx-auto text-center w-full min-h-[25vw]">
            <h1 className="text-7xl font-bold"> Discover Your Next</h1>
            <h2 className="text-5xl font-semibold">Favorite Manga</h2>
            <p className="text-lg text-muted max-w-2xl mt-3 mx-auto">
              Dive into an endless world of manga. Browse, read, and track your favorite series all in one place. Join
              thousands of readers on {process.env.NEXT_PUBLIC_NAME}
            </p>
            <div className="flex space-x-3 mt-4 place-content-center">
              <a href="/home" className="inline-flex items-center bg-accent px-6 py-3 rounded-lg text-xl hover:bg-foreground transition">
                <PlayIcon className="size-5 mr-2" />
                Start Reading
              </a>
              <a href="/discover" className="inline-flex items-center bg-foreground px-6 py-3 rounded-lg text-xl hover:bg-foreground/50 border border-foreground hover:border-accent transition">
                Browse Catalog
              </a>
            </div>
          </div>
          <div className="flex flex-col space-y-4 mx-auto text-center w-full">
            <div className="grid grids-cols-1 md:grid-cols-4 gap-12 pt-5 w-full">
              <div className="flex flex-col p-5 bg-foreground rounded-md">
                <BookMarkedIcon className="size-9 mx-auto mb-3" />
                <h1 className="text-3xl">{indexData.mangaTitles}</h1>
                <h2 className="text-md text-muted">Manga Titles</h2>
              </div>
              <div className="flex flex-col p-5 bg-foreground rounded-md">
                <UsersIcon className="size-9 mx-auto mb-3" />
                <h1 className="text-3xl">{indexData.userCount}</h1>
                <h2 className="text-md text-muted">Active Readers</h2>
              </div>
              <div className="flex flex-col p-5 bg-foreground rounded-md">
                <MessageCircleIcon className="size-9 mx-auto mb-3" />
                <h1 className="text-3xl">{indexData.commentCount}</h1>
                <h2 className="text-md text-muted">Reviews Written</h2>
              </div>
              <div className="flex flex-col p-5 bg-foreground rounded-md">
                <TrendingUp className="size-9 mx-auto mb-3" />
                <h1 className="text-3xl">{indexData.chaptersRead}</h1>
                <h2 className="text-md text-muted">Chapters Read</h2>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}