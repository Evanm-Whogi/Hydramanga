"use client";
import { useEffect, useState, memo, useTransition, Fragment, useRef } from 'react';
import { getMangaAnalytics, triggerMangaScan } from '@/services/mangaService';
import {  formatToRating, formatTimeAgo } from '@/lib/utils';
import Link from 'next/link';
import MangaActions from './MangaActions';
import RecommendedManga from './RecommendedManga';
import { Eye, Bookmark, UserCheck, TriangleAlert, Star } from 'lucide-react';
import { useMangaViewTracking } from '@/hooks/useViewTracking';
import { useMangaImportProgress } from '@/hooks/useMangaImportProgress';
import { showImportProgressToast, updateImportProgressToast, dismissImportProgressToast } from '@/components/ImportProgressToast';
import { WARNING_GENRES, WARNING_RATINGS } from '@/constants/filters';

// Memoized Header to prevent blur/filter recalculations on state changes
const MangaHeader = memo(({ cover }: { cover: string }) => {
  return (
    <div
      className="h-82 z-10 absolute lg:relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:-z-10 before:bg-(image:--manga-cover) before:bg-cover before:bg-center before:brightness-[0.7] before:blur-[6px] before:scale-110"
      style={{ '--manga-cover': `url(${cover})` } as React.CSSProperties}
    ></div>
  );
});

const getLinkName = (url: string) => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace('www.', '');

    const domainMap: Record<string, string> = {
      'magazine.younganimal.com': 'Young Animal',
      'series.naver.com': 'Naver Series',
      'm.comic.naver.com': 'Naver Webtoon',
      'kana.fr': 'Kana',
      'shogakukan.co.jp': 'Shogakukan',
      'viz.com': 'VIZ Media',
      'kodansha.co.jp': 'Kodansha',
      'morning.kodansha.co.jp': 'Kodansha Morning',
      'morningmanga.com': 'Morning Manga',
      'en.wikipedia.org': 'Wikipedia (EN)',
      'ja.wikipedia.org': 'Wikipedia (JA)',
      'mangabaka.org': 'MangaBaka',
    };

    if (domainMap[hostname]) return domainMap[hostname];

    const parts = hostname.split('.');
    const namePart = parts.length > 2 ? parts[parts.length - 2] : parts[0];

    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  } catch {
    return 'Link';
  }
};

const PLATFORM_URLS: Record<string, string> = {
  kitsu: "https://kitsu.io/manga/",
  anilist: "https://anilist.co/manga/",
  shikimori: "https://shikimori.one/mangas/",
  anime_planet: "https://www.anime-planet.com/manga/",
  manga_updates: "https://www.mangaupdates.com/series.html?id=",
  my_anime_list: "https://myanimelist.net/manga/",
  anime_news_network: "https://www.animenewsnetwork.com/encyclopedia/manga.php?id="
};

MangaHeader.displayName = 'MangaHeader';

const MangaDetails = memo(({ manga }: { manga: any }) => (
  <div className="mt-2 flex flex-col gap-3">
    <div className="flex gap-2 items-center flex-wrap">
      <strong className="text-muted">Authors:</strong>
      {manga.authors &&
        manga.authors.slice(0, 10).map((author: string, index: number) => (
          <div key={index} className="px-2 py-1 bg-foreground rounded-md text-sm">
            {author}
          </div>
        ))}
      {manga.authors?.length > 10 && <span className="text-xs text-muted">+{manga.authors.length - 10} more</span>}
    </div>
    <div className="flex gap-2 items-center flex-wrap">
      <strong className="text-muted">Artists:</strong>
      {manga.artists &&
        manga.artists.slice(0, 10).map((artist: string, index: number) => (
          <div key={index} className="px-2 py-1 bg-foreground rounded-md text-sm">
            {artist}
          </div>
        ))}
      {manga.artists?.length > 10 && <span className="text-xs text-muted">+{manga.artists.length - 10} more</span>}
    </div>
    <div className="flex gap-2 items-center flex-wrap">
      <strong className="text-muted">Publishers:</strong>
      {manga.publishers &&
        manga.publishers.map((publisher: { name: string, note: string, type: string }, index: number) => (
          <span key={index} className="px-2 py-1 bg-foreground rounded-md text-sm hover:bg-foreground/70">
            {publisher.name}
          </span>
        ))}
    </div>
    <div className="flex gap-2 items-center flex-wrap">
      <strong className="text-muted">Track Manga:</strong>
      {Object.entries(manga.source).map(([key, platform]: [key: any, platform: any], index) => {
          return (
            <a key={index} href={`${PLATFORM_URLS[key]}${platform.id}`} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-foreground rounded-md text-sm hover:bg-foreground/50 transition-colors flex gap-2 items-center">
              <span className="capitalize">{key.replace(/_/g, ' ')}</span>
            </a>
          );
        })}
    </div>
    <div className="flex gap-2 items-center flex-wrap mb-5">
      <strong className="text-muted">External Links:</strong>
      {manga.links &&
        manga.links.slice(0, 8).map((link: string, index: number) => (
          <a key={index} href={link} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-foreground rounded-md text-sm hover:bg-foreground/70">
            {getLinkName(link)}
          </a>
        ))}
      {manga.links?.length > 8 && <span className="text-xs text-muted">+{manga.links.length - 8} more</span>}
    </div>
  </div>
));

MangaDetails.displayName = 'MangaDetails';

interface MangaContentProps {
  manga: any;
  initialListName: string | null;
  gallery: any[];
}

export default function MangaContent({ manga, initialListName, gallery }: MangaContentProps) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [wasActiveOnLoad, setWasActiveOnLoad] = useState(false);
  const [initialProgressReceived, setInitialProgressReceived] = useState(false);
  const [localChapters, setLocalChapters] = useState(manga.chapters || []);
  const mangaId = Number(manga.id);

  // Reset progress tracking state when manga changes
  useEffect(() => {
    setInitialProgressReceived(false);
    setWasActiveOnLoad(false);
  }, [mangaId]);

  // Track manga views
  useMangaViewTracking(mangaId, manga.title);

  // Always track import progress for this manga (works for all users)
  const { progress } = useMangaImportProgress(
    mangaId,
    {
      enabled: true,
      mangaTitle: manga.title,
      onProgress: (progressData) => {
        // If progress includes newly downloaded chapter info, add it to local state
        if (progressData.lastDownloadedChapter) {
          setLocalChapters((prev: any[]) => {
            const exists = prev.some((ch: any) => ch.chapterNumber === progressData.lastDownloadedChapter?.chapterNumber);
            if (!exists && progressData.lastDownloadedChapter) {
              const newChapter = {
                id: progressData.lastDownloadedChapter?.id || Math.random(),
                chapterNumber: progressData.lastDownloadedChapter?.chapterNumber,
                title: progressData.lastDownloadedChapter?.title,
                pageCount: progressData.lastDownloadedChapter?.pageCount || 0,
                updatedAt: progressData.lastDownloadedChapter?.updatedAt || new Date().toISOString(),
                createdAt: progressData.lastDownloadedChapter?.createdAt || new Date().toISOString(),
                viewStats: { totalViews: 0, uniqueViews: 0 },
                description: null,
                volumeNumber: null,
                storagePrefix: '',
                seriesId: mangaId,
              };
              return [...prev, newChapter].sort((a: any, b: any) => 
                parseFloat(b.chapterNumber || '0') - parseFloat(a.chapterNumber || '0')
              );
            }
            return prev;
          });
        }
      },
    }
  );

  // Show/update toast only for active imports (not completed/failed on page load)
  useEffect(() => {
    if (!progress) return;

    const isActiveStatus = progress.status === 'scanning' || progress.status === 'downloading';
    const isTerminalStatus = progress.status === 'completed' || progress.status === 'failed';

    // First progress update received
    if (!initialProgressReceived) {
      setInitialProgressReceived(true);
      // Only show toast if it's actively running on initial load
      if (isActiveStatus) {
        setWasActiveOnLoad(true);
        updateImportProgressToast(mangaId, manga.title, progress);
      }
      return;
    }

    // Subsequent updates - show if actively running
    if (isActiveStatus) {
      setWasActiveOnLoad(true);
      updateImportProgressToast(mangaId, manga.title, progress);
    }
    // Show completion/failure only if we were tracking an active import
    else if (wasActiveOnLoad && isTerminalStatus) {
      updateImportProgressToast(mangaId, manga.title, progress);
    }
  }, [progress, mangaId, manga.title, wasActiveOnLoad, initialProgressReceived]);

  // Cleanup: dismiss toast when navigating away
  useEffect(() => {
    return () => {
      dismissImportProgressToast(mangaId);
    };
  }, [mangaId]);

  const isFetchingAnalytics = useRef(false);

  useEffect(() => {
    // Only trigger scan if no chapters exist
    // The backend will check manga_import_progress to prevent duplicate scans
    if ((manga.chapters?.length || 0) === 0) {
      setWasActiveOnLoad(true);
      showImportProgressToast(mangaId, manga.title);
      triggerMangaScan(mangaId)
        .then((response) => {
          // Backend returns status if already scanning/downloading
          if (response?.status) {
            console.log(`Manga ${mangaId} is already ${response.status}`);
          }
        })
        .catch((err) => {
          console.error('Failed to trigger manga scan:', err);
        });
    }
    
    let isMounted = true;
    
    const getAnalyticsData = async () => {
      if (isFetchingAnalytics.current) return;
      
      isFetchingAnalytics.current = true;
      try {
        const analyticsData = await getMangaAnalytics(Number(manga.id)).catch(() => null);
        if (isMounted) {
          setAnalytics(analyticsData?.stats);
        }
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        isFetchingAnalytics.current = false;
      }
    };

    getAnalyticsData();
    const intervalId = setInterval(getAnalyticsData, 60000);

    return () => {
      isMounted = false;
      isFetchingAnalytics.current = false;
      clearInterval(intervalId);
    };
  }, [mangaId, manga.chapters?.length, manga.title])

  // Determine last chapter update date for analytics section
  const lastChapterDate = manga.chapters.length > 0 ? new Date(manga.chapters.reduce((latest: string, chapter: any) => {
    const chapterDate = new Date(chapter.updatedAt);
    return chapterDate > new Date(latest) ? chapter.updatedAt : latest;
  }, manga.chapters[0].updatedAt)) : null;

  // Format description with line breaks, bold, and italics
  const formattedDescription = manga.description
    ? manga.description.split('<br>').map((line: string, index: number) => {
        // Split line by <i> and <b> tags and render as React elements
        const parts = line.split(/(<i>.*?<\/i>|<b>.*?<\/b>)/);
        return (
          <Fragment key={index}>
            {parts.map((part: string, partIndex: number) => {
              if (part.match(/^<i>.*<\/i>$/)) {
                const content = part.replace(/<i>(.*?)<\/i>/g, '$1');
                return <em key={partIndex}>{content}</em>;
              }
              if (part.match(/^<b>.*<\/b>$/)) {
                const content = part.replace(/<b>(.*?)<\/b>/g, '$1');
                return <strong key={partIndex}>{content}</strong>;
              }
              return part ? <span key={partIndex}>{part}</span> : null;
            })}
            <br />
          </Fragment>
        );
      })
    : null;

    const containsAdultContent =
      WARNING_GENRES.some((genre) => manga.genres?.includes(genre)) ||
      WARNING_RATINGS.some((rating) => manga.contentRating?.toLowerCase() === rating);

    const containsAdultWarning = containsAdultContent ? (
      <div className="bg-foreground/50 border border-borders rounded-md p-2 w-full flex items-center gap-2">
        <p className="font-bold text-lg text-accent items-center"><TriangleAlert className="inline mr-2 size-5" />Reader Discretion:</p>
        <div className="flex gap-2 items-center flex-wrap mt-1">
          {WARNING_GENRES.filter((genre) => manga.genres?.includes(genre)).map((genre, index) => (
            <span key={index} className="px-2 py-1 bg-red-400/20 rounded-md text-sm text-red-400">
              {genre}
            </span>
          ))}
          {WARNING_RATINGS.filter((rating) => manga.contentRating?.toLowerCase() === rating).map((rating, index) => (
            <span key={index} className="px-2 py-1 bg-red-400/20 rounded-md text-sm text-red-400">
              {rating.charAt(0).toUpperCase() + rating.slice(1)}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <>
      <MangaHeader cover={manga?.cover?.x350?.x3 || manga?.cover?.raw?.url || "/notFound.png"} />
      <div className="container mx-auto pt-5 px-4 md:px-0 mt-25 md:mt-0">
        <div className="flex flex-col lg:flex-row gap-6 lg:place-content-evenly mb-5">
          {/* Main Content */}
          <div className="flex flex-col space-y-3 w-full lg:w-2/3 mb-5">
              {containsAdultContent && containsAdultWarning}
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              {manga.title} 
               {analytics?.manga && (
                <span className="text-sm md:text-base text-muted items-center">
                  <Star className="inline mr-1 mb-1 size-4 fill-green-600 text-green-600 items-center" />
                  {analytics?.manga?.reviewRating || formatToRating(manga.rating) || 0} <span className="text-sm text-muted">({analytics?.manga?.reviewCount || 0} Reviews)</span>
                </span>
               )}
            </h1>
            { manga.romanizedTitle || manga.nativeTitle ? (
            <h2 className="text-base md:text-lg text-muted font-semibold">[{manga.romanizedTitle} | {manga.nativeTitle}]</h2>
            ): null }
            <div className="flex gap-2 items-center flex-wrap">
              <span className="bg-green-400/20 w-fit px-2 py-1 rounded-lg capitalize text-sm">{manga.status}</span>
              {analytics?.manga && (
                <div className="flex items-center gap-3 text-xs md:text-sm text-muted flex-wrap">
                  <div className="flex items-center">
                    <Eye className="size-3 md:size-4 mr-1 text-blue-400" />
                    <span className="font-semibold">{formatNumber(analytics.manga.totalViews)}</span>
                    <span className="ml-1">views</span>
                  </div>
                  <div className="flex items-center">
                    <Bookmark className="size-3 md:size-4 mr-1 text-yellow-400" />
                    <span className="font-semibold">{formatNumber(analytics.manga.bookmarks)}</span>
                    <span className="ml-1">bookmarks</span>
                  </div>
                  <div className="flex items-center">
                    <UserCheck className="size-3 md:size-4 mr-1 text-green-400" />
                    <span className="font-semibold">{formatNumber(analytics.manga.followers)}</span>
                    <span className="ml-1">Followed</span>
                  </div>
                </div>
              )}
            </div>

            <p className={`text-muted text-sm md:text-base${showDetails ? '' : ' line-clamp-4'}`}>{formattedDescription}</p>
            {showDetails && <MangaDetails manga={manga} />}

            <div className="flex gap-2 flex-wrap">
              {manga.genres &&
                manga.genres.map((item: string, index: number) => (
                  <Link href={`/discover?genres=${item}`} key={index} className="bg-foreground w-fit px-2 py-1 rounded-lg text-xs md:text-sm capitalize hover:bg-foreground/50">
                    {item}
                  </Link>
                ))}
            </div>

            <button
              onClick={() => startTransition(() => setShowDetails((prev) => !prev))}
              disabled={isPending}
              className="mt-4 px-4 py-2 bg-foreground text-primary rounded-lg w-fit text-sm hover:bg-foreground/50 hover:cursor-pointer disabled:opacity-50"
            >
              {showDetails ? 'Hide Details' : 'Show Details...'}
            </button>

            <MangaActions 
              manga={manga} 
              chapters={localChapters} 
              comments={manga.comments} 
              gallery={gallery}
              initialListName={initialListName} 
              importProgress={progress} 
            />
          </div>

          {/* Sidebar */}
          <div className="flex flex-col w-full lg:w-79.75 lg:relative lg:-top-35 lg:z-25 gap-4">
            {/* Cover Image */}
            <div className="w-full md:max-w-xs lg:max-w-none mx-auto lg:mx-0 overflow-hidden rounded-md border-4 border-background shadow-lg">
              <img src={manga.cover?.raw?.url || "/notFound.png"} alt="manga" className="w-full h-auto object-cover" />
            </div>

            {/* Info Box */}
            <div className="bg-foreground rounded-md p-4 md:p-5 w-full">
              <div className="flex flex-col gap-2 text-sm md:text-base">
                <div className="flex justify-between text-muted capitalize">
                  Rating <span>{manga.contentRating}</span>
                </div>
                <div className="flex justify-between text-muted">
                  Release Year <span>{manga.year}</span>
                </div>
                <div className="flex justify-between text-muted">
                  Total Chapters <span>{manga.totalChapters}</span>
                </div>
                <div className="flex justify-between text-muted">
                  Has Anime? { manga.hasAnime ? (
                    <a href={`https://hianime.to/search?keyword=${encodeURIComponent(manga.title)}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent text-primary">Yes</a>
                    ): (
                      <span className="text-muted">No</span>
                    )}
                </div>
                <div className="flex justify-between text-muted">
                  Score <span>{Math.floor(manga.weightedScore)}</span>
                </div>
              </div>
            </div>

            {/* Update Dates Box */}
            <div className="bg-foreground rounded-md p-4 md:p-5 w-full">
              <div className="flex flex-col gap-2 text-xs md:text-sm">
                <div className="flex justify-between text-muted">
                  Meta Updated: <span className="text-normal">{formatTimeAgo(manga.lastUpdatedAt)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  Chapters Updated: <span className="text-normal">{lastChapterDate ? formatTimeAgo(lastChapterDate) : 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Relations Box */}
            <div className="bg-foreground rounded-md p-4 md:p-5 w-full">
              <div className="flex flex-col gap-3">
                <h2 className="text-base md:text-lg font-bold">Relations</h2>
                {manga.relationships && Object.keys(manga.relationships).length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {Object.entries(manga.relationships).map(([category, items]: [string, any]) => (
                      <div key={category} className="flex flex-col gap-2">
                        <h3 className="text-xs md:text-sm font-semibold capitalize text-muted">{category}</h3>
                        <div className="flex flex-col gap-2 pl-2 border-l border-muted/30">
                          {items.map((item: any, index: number) => (
                            <Link key={index} href={`/manga/${item.id}`} className="flex gap-2 items-start hover:opacity-80 transition-opacity">
                              {item.image?.x150?.x2 && (
                                <img src={item.image.x150.x2} alt={item.name} className="w-10 md:w-12 h-14 md:h-16 object-cover rounded shrink-0" />
                              )}
                              <div className="flex flex-col justify-center min-w-0">
                                <span className="text-xs md:text-sm font-medium truncate">{item.name}</span>
                                <span className="text-xs text-muted">ID: {item.id}</span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted text-sm">No relations available.</span>
                )}
              </div>
            </div>

            {/* Recommended Manga */}
            <RecommendedManga currentMangaId={mangaId} />
          </div>
        </div>
      </div>
    </>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
