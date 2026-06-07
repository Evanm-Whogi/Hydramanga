"use client";
import { useEffect, useState, memo, useTransition, Fragment, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getMangaAnalytics } from '@/services/mangaService';
import { formatToRating, formatTimeAgo, formatCompactNumber as formatNumber } from '@/lib/utils';
import Link from 'next/link';
import MangaActions from './MangaActions';
import RecommendedManga from './RecommendedManga';
import { Eye, Bookmark, UserCheck, TriangleAlert, Star, Pencil, ShareIcon, StickyNote } from 'lucide-react';
import { useMangaViewTracking } from '@/hooks/useViewTracking';
import { useMangaImportProgress } from '@/hooks/useMangaImportProgress';
import { useVisibilityAwareInterval } from '@/hooks/useVisibilityAwareInterval';
import { useUser } from '@/providers/UserProvider';
import { updateImportProgressToast, dismissImportProgressToast } from '@/components/ImportProgressToast';
import AdminMangaEditModal from './AdminMangaEditModal';
import ReportMangaModal from './ReportMangaModal';
import { WARNING_GENRES, WARNING_RATINGS } from '@/constants/filters';
import { toast } from 'react-toastify';

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
          <Link key={index} href={`/discover?search=${author}`} className="px-2 py-1 bg-foreground rounded-md text-sm hover:bg-foreground/70 hover:cursor-pointer">
            {author}
          </Link>
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
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [sidebarHeight, setSidebarHeight] = useState<number | null>(null);
  const [isLg, setIsLg] = useState(false);
  const [chaptersMaxHeight, setChaptersMaxHeight] = useState<number | null>(null);
  const mangaId = Number(manga.id);
  const { user } = useUser();
  const isAdmin = user?.role === 'admin';
  const router = useRouter();
  const isFetchingAnalytics = useRef(false);
  const analyticsRefreshRef = useRef<() => void>(() => {});

  // Track sidebar height (lg only, when side-by-side)
  useEffect(() => {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      if (mql.matches) setSidebarHeight(sidebar.getBoundingClientRect().height);
      else setSidebarHeight(null);
    };
    setIsLg(mql.matches);
    const onResize = () => {
      setIsLg(mql.matches);
      if (mql.matches) setSidebarHeight(sidebar.getBoundingClientRect().height);
      else setSidebarHeight(null);
    };
    const observer = new ResizeObserver((entries) => {
      if (mql.matches && entries[0]) setSidebarHeight(entries[0].contentRect.height);
    });
    observer.observe(sidebar);
    mql.addEventListener("change", onResize);
    update();
    return () => {
      observer.disconnect();
      mql.removeEventListener("change", onResize);
    };
  }, []);

  // Compute chapters list max height so its bottom aligns with the sidebar bottom.
  // Uses getBoundingClientRect() so margin, padding, and sidebar -top offset are all accounted for.
  useEffect(() => {
    if (!isLg || sidebarHeight == null) {
      setChaptersMaxHeight(null);
      return;
    }
    const sidebar = document.getElementById("sidebar");
    const chaptersScroll = document.getElementById("chapters-scroll");
    if (!sidebar || !chaptersScroll) return;

    const compute = () => {
      const sidebarRect = sidebar.getBoundingClientRect();
      const chaptersRect = chaptersScroll.getBoundingClientRect();
      // Align bottom of chapters list with bottom of sidebar (handles -top-35, gaps, etc.)
      const available = sidebarRect.bottom - chaptersRect.top;
      setChaptersMaxHeight(Math.max(0, available));
    };

    compute();

    const resizeObserver = new ResizeObserver(compute);
    resizeObserver.observe(sidebar);
    resizeObserver.observe(chaptersScroll);
    window.addEventListener("resize", compute);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [isLg, sidebarHeight]);

  // Reset progress tracking state when manga changes
  useEffect(() => {
    setInitialProgressReceived(false);
    setWasActiveOnLoad(false);
  }, [mangaId]);

  // Track manga views
  useMangaViewTracking(mangaId, manga.title, Boolean(user));

  // Always track import progress for this manga (works for all users)
  const { progress } = useMangaImportProgress(
    mangaId,
    {
      enabled: Boolean(user),
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

  useEffect(() => {
    if (progress?.status === 'completed') {
      analyticsRefreshRef.current();
    }
  }, [progress?.status]);

  // Cleanup: dismiss toast when navigating away
  useEffect(() => {
    return () => {
      dismissImportProgressToast(mangaId);
    };
  }, [mangaId]);

  useEffect(() => {
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

    analyticsRefreshRef.current = () => { void getAnalyticsData(); };
    void getAnalyticsData();

    return () => {
      isMounted = false;
      isFetchingAnalytics.current = false;
    };
  }, [mangaId]);

  useVisibilityAwareInterval(() => analyticsRefreshRef.current(), 300_000, true);

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

    const handleShareClick = (id: number, title: string) => {
      const url = `${window.location.origin}/manga/${id}`;
      navigator.clipboard.writeText(url);
      toast.success('Manga URL copied to clipboard');
    };

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

    const mangaNote = manga.note?.trim();
    const mangaNoteBanner = mangaNote ? (
      <div className="bg-foreground/50 border border-borders rounded-md p-2 w-full flex items-center">
          <StickyNote className="inline mr-2 size-5 text-accent" />
          <span className="text-sm mr-2 font-bold text-accent">Admin Note:</span>
        <p className="text-sm text-primary">{mangaNote}</p>
      </div>
    ) : null;

  return (
    <>
      <MangaHeader cover={manga?.cover?.x350?.x3 || manga?.cover?.raw?.url || "/notFound.png"} />
      <div className="container mx-auto pt-5 px-4 xl:px-0 mt-25 md:mt-0">
        <div className="flex flex-col lg:flex-row gap-6 lg:place-content-evenly mb-5 lg:items-start">
          {/* Main Content */}
          <div className="flex flex-col space-y-3 w-full lg:w-2/3 mb-5">
            <div className={`space-y-3 flex flex-col ${isLg && sidebarHeight != null ? "shrink-0" : ""}`}>
              {mangaNote && mangaNoteBanner}
              {containsAdultContent && containsAdultWarning}
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              {manga.title} 
               {analytics?.manga && (
                <span className="text-sm md:text-base text-muted items-center">
                  <Star className="inline mr-1 mb-1 size-4 fill-green-600 text-green-600 items-center" />
                  {analytics?.manga?.reviewRating || formatToRating(manga.rating) || 0} <span className="text-sm text-muted">({analytics?.manga?.reviewCount || 0} Reviews)</span>
                </span>
               )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setAdminModalOpen(true)}
                  className="p-2 cursor-pointer rounded-md bg-foreground hover:bg-foreground/80 text-muted hover:text-primary"
                  title="Edit manga (admin)"
                  aria-label="Edit manga"
                >
                  <Pencil className="size-5" />
                </button>
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
            </div>

            <MangaActions 
              manga={manga} 
              chapters={localChapters} 
              comments={manga.comments}
              commentPagination={manga.commentPagination}
              gallery={gallery}
              initialListName={initialListName} 
              importProgress={progress} 
              chaptersMaxHeight={chaptersMaxHeight}
            />
          </div>

          {/* Sidebar */}
          <div id="sidebar" className="flex flex-col w-full lg:w-79.75 lg:relative lg:-top-35 lg:z-25 gap-4">
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
                <div className="flex justify-between text-muted">
                  <div className="w-full flex gap-2">
                    {user && (
                    <button type="button" onClick={() => setReportModalOpen(true)} className="px-4 py-2 bg-background text-primary rounded-lg w-full text-sm hover:bg-background/50 hover:cursor-pointer disabled:opacity-50">
                      Report Issue
                    </button>
                    )}
                    <button onClick={() => handleShareClick(manga.id, manga.title)} type="button" className="flex items-center justify-center gap-2 px-4 py-2 bg-background text-primary rounded-lg w-full text-sm hover:bg-background/50 hover:cursor-pointer disabled:opacity-50">
                      <ShareIcon className="size-4" /> Share
                    </button>
                  </div>
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

      {reportModalOpen && (
        <ReportMangaModal
          mangaId={mangaId}
          mangaTitle={manga.title}
          onClose={() => setReportModalOpen(false)}
        />
      )}
      {isAdmin && adminModalOpen && (
        <AdminMangaEditModal
          mangaId={mangaId}
          mangaTitle={manga.title}
          manga={manga}
          secondaryTitles={manga.secondaryTitles}
          chapters={localChapters.map((ch: any) => ({ id: ch.id, chapterNumber: ch.chapterNumber, title: ch.title }))}
          currentScraperId={progress?.scraperId}
          currentScraperUrl={progress?.scraperUrl}
          isScanActive={progress?.status === "scanning" || progress?.status === "downloading"}
          onClose={() => setAdminModalOpen(false)}
          onSourceSet={() => {}}
          onVariantAdded={() => {}}
          onChaptersDeleted={() => router.refresh()}
          onMetadataUpdated={() => router.refresh()}
        />
      )}
    </>
  );
}

