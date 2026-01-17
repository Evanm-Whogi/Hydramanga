"use client";
import { Star, TrendingUp, PlayIcon } from "lucide-react";
import Pill from "@/components/Pill";

export default function Hero() {

    return (
        <section id="hero" className="pt-25">
            <div className="container mx-auto text-primary flex flex-col pt-[6vh] min-h-[65vh] overflow-hidden">
                <div className="absolute inset-0 -z-50 max-h-[65vh] overflow-hidden">
                    <div className="absolute inset-0 bg-cover bg-center scale-100" 
                        style={{ backgroundImage: `url('https://a.storyblok.com/f/178900/2000x800/dca56718f6/ef409152bda0452ab6d673416e7554d71663038752_main.jpg/m/filters:quality(95)format(webp)')` }}
                    />
                    <div className="absolute inset-0 bg-linear-to-r from-background via-background/95 to-background/60" />
                    <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-background/80" />
                    <div className="absolute top-20 right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-float-aggressive" />
                    <div className="absolute bottom-20 left-20 w-64 h-64 bg-accent/20 rounded-full blur-3xl animate-float-aggressive"/>
                </div>

                <div className="flex flex-row items-center justify-between space-x-6">
                    <div className="flex flex-col space-y-4 max-w-6xl">
                        <div className="flex px-4 py-2 bg-accent/20 backdrop-blur-sm rounded-full items-center w-fit animate-glow border border-accent/40 animate-shimmer">
                            <TrendingUp className="size-5 mr-2" />
                            <span className="text-sm font-semibold">#1 Trending This Week</span>
                        </div>

                        <h1 className="text-5xl md:text-6xl font-bold leading-tight"> Frieren: Beyond Journey's End</h1>
                        <div className="flex space-x-3 text-sm">
                            <Pill text="Action" theme="accent" size="px-2.5 py-0.5"/>
                            <Pill text="Adventure" theme="accent" size="px-2.5 py-0.5"/>
                            <Pill text="Drama" theme="accent" size="px-2.5 py-0.5"/>
                            <Pill text="Fantasy" theme="accent" size="px-2.5 py-0.5"/>
                        </div>
                        <div className="text-lg text-muted max-w-4xl mt-3">
                            After the defeat of the Demon King, the hero's party disbanded. The elf mage Frieren, who had a lifespan far exceeding that of humans, set out on a new journey to understand more about human emotions and life, reflecting on the fleeting nature of human existence.
                        </div>
                        <div className="flex mt-4 space-x-6">
                            <div className="flex items-center text-xl font-bold">
                                <div className="mr-1 bg-yellow-600/20 backdrop-blur-sm rounded-md p-2 border border-yellow-600/40 flex items-center justify-center">
                                    <Star className="size-4 text-yellow-400" />
                                </div>
                                <div className="flex flex-col pl-3">
                                    <span className="text-primary">4.8</span>
                                    <span className="text-muted text-sm">15,420 ratings</span>
                                </div>
                            </div>
                            <div className="w-px h-12 bg-foreground"></div>
                            <div className="flex flex-col pl-3 text-xl font-bold">
                                <span className="text-primary">180</span>
                                <span className="text-muted text-sm">Chapters</span>
                            </div>
                            <div className="w-px h-12 bg-foreground"></div>
                            <div className="flex flex-col pl-3 text-xl font-bold">
                                <span className="text-primary">Ongoing</span>
                                <span className="text-muted text-sm">Status</span>
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-4">
                            <a href="/read/1" className="inline-flex items-center bg-accent px-6 py-3 rounded-lg text-xl hover:bg-foreground transition"><PlayIcon className="size-5 mr-2" /> Read Now</a>
                            <a href="/catalog" className="inline-flex items-center bg-foreground px-6 py-3 rounded-lg text-xl hover:bg-foreground/50 border border-foreground hover:border-accent transition">Add to Library</a>
                        </div>
                    </div>
                    <div className="hidden md:flex items-center mx-auto">
                        <img src="https://static.wikia.nocookie.net/frieren/images/0/0e/Volume_1.png" alt="Hero Image" className="w-[328] object-contain" />
                    </div>
                </div>
            </div>
        </section>
    );
}