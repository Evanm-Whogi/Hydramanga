"use server";
import SectionHeader from "./SectionHeader";
import MangaCard from "@/components/MangaCard";
import TrendingMangaCard from "@/components/TrendingMangaCard";
import { getHomepage } from '@/services/mangaService'
import CommentCard from "@/app/home/components/CommentCard";
export default async function Lists({ mangaData }: any) {

    return (
    <section id="lists" className="pb-25">
        <div className="container mx-auto text-primary space-y-24">

            {mangaData.trending?.length > 0 && (
                <>
                    <SectionHeader title="Trending This Week" filters="status=releasing&sort=rating&order=desc"/>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                        {mangaData.trending.map((manga: any, index: number) => (
                            <TrendingMangaCard key={manga.id} manga={manga} rank={index + 1} />
                        ))}
                    </div>
                </>
            )}

            {mangaData.added?.length > 0 && (
                <>
                    <SectionHeader title="Recently Added" filters="year=2026&sort=lastUpdatedAt"/>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                        {mangaData.added.map((manga: any) => (
                            <MangaCard key={manga.id} manga={manga} />
                        ))}
                    </div>
                </>
            )}

            {mangaData.popular?.length > 0 && (
                <>
                    <SectionHeader title="Most Popular" filters="sort=weightedScore"/>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                        {mangaData.popular.map((manga: any) => (
                            <MangaCard key={manga.id} manga={manga} />
                        ))}
                    </div>
                </>
            )}

            {/* Recent Comments */}
            {mangaData.recentComments?.length > 0 && (
                <>
                    <SectionHeader title="Recent Comments" filters="sort=lastCommentedAt"/>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                        {mangaData.recentComments.map((comment: any) => (
                            <CommentCard key={comment.id} comment={comment} />
                        ))}
                    </div>
                </>
            )}

            {mangaData.updated?.length > 0 && (
                <>
                    <SectionHeader title="Recently Updated" filters="sort=lastUpdatedAt"/>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                        {mangaData.updated.map((manga: any) => (
                            <MangaCard key={manga.id} manga={manga} />
                        ))}
                    </div>
                </>
            )}

            {mangaData.featured?.length > 0 && (
                <>
                    <SectionHeader title="Staff Picks" filters=""/>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                        {mangaData.featured.map((manga: any) => (
                            <MangaCard key={manga.id} manga={manga} />
                        ))}
                    </div>
                </>
            )}        

            {mangaData.upcoming?.length > 0 && (
                <>
                    <SectionHeader title="Upcoming" filters="status=upcoming"/>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-6">
                        {mangaData.upcoming.slice(0, 8).map((manga: any) => (
                            <MangaCard key={manga.id} manga={manga} />
                        ))}
                    </div>
                </>
            )}  
        </div>
    </section>
    );
}