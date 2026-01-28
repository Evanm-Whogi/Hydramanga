"use client";
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetchMangaPages, updateProgress } from '@/services/mangaService';
import { getBookmark, addBookmark, removeBookmark } from '@/services/bookmarkService';
import { useUser } from '@/providers/UserProvider';
import { MenuIcon, X, BookmarkIcon } from 'lucide-react';
import { useChapterViewTracking } from '@/hooks/useViewTracking';
import BookmarkModal from '@/components/BookmarkModal';
import { recordReadingTime } from '@/services/mangaService';

const SIDEBAR_WIDTH_PX = 260; // matches md:w-65 / md:w-[calc(100%-260px)]

interface Chapter {
  id: number;
  seriesId: number;
  title: string | null;
  chapterNumber: string;
  volumeNumber: string | null;
  localPath: string;
  images: string[];
  allChapters?: Chapter[];
}

export default function ReadContent({ mangaTitle }: { mangaTitle: string }) {
  const params = useParams() as Record<string, string | undefined>;
  const id = params?.id;
  const chapterId = params?.chapterId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const [data, setData] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [lastTrackedPage, setLastTrackedPage] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [bookmarkModalOpen, setBookmarkModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileHeaderRef = useRef<HTMLDivElement>(null);
  const lastScrollPos = useRef(0);
  const hasScrolledToPage = useRef(false);
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track chapter view on client-side mount
  useChapterViewTracking(id as string, chapterId as string);

  // Reading time tracking
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef(0);

  // Start reading timer on mount/chapter change
  useEffect(() => {
    setElapsedSeconds(0);
    lastSentRef.current = 0;
    if (!user || !id || !chapterId) return;

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // On unmount/chapter change, send any remaining time
      if (elapsedSeconds > 0) {
        sendReadingTime(elapsedSeconds);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id, chapterId]);

  // Periodically send reading time every 30s
  useEffect(() => {
    if (!user || !id || !chapterId) return;
    if (elapsedSeconds > 0 && elapsedSeconds - lastSentRef.current >= 10) {
      sendReadingTime(elapsedSeconds - lastSentRef.current);
      lastSentRef.current = elapsedSeconds;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds]);

  // Send reading time to backend
  const sendReadingTime = async (seconds: number) => {
    if (!user || !id || !chapterId || seconds <= 0) return;
    try {
      await recordReadingTime({
        seriesId: Number(id),
        chapterId: Number(chapterId),
        seconds: seconds,
      });
    } catch (err) {
      // Optionally handle/report error
      // console.error('Failed to record reading time', err);
    }
  };

  useEffect(() => {
    const loadMangaPages = async () => {
      if (!id || !chapterId) return;
      try {
        const response = await fetchMangaPages(id, chapterId);
        setData(response);
        setAllChapters(response.allChapters || []);
      } catch (error) {
        console.error('Error fetching manga pages:', error);
      } finally {
        setLoading(false);
      }
    };
    loadMangaPages();
  }, [id, chapterId]);

  // Fetch bookmark status for current chapter
  useEffect(() => {
    if (!user || !id || !chapterId) return;

    const fetchBookmarkStatus = async () => {
      try {
        const response = await getBookmark(Number(id), Number(chapterId));
        if (response?.bookmark) {
          setIsBookmarked(true);
          setBookmarkNote(response.bookmark.note || '');
        } else {
          setIsBookmarked(false);
          setBookmarkNote('');
        }
      } catch (error) {
        console.error('Failed to fetch bookmark status:', error);
      }
    };

    fetchBookmarkStatus();
  }, [user, id, chapterId]);

  useEffect(() => {
    const mainNav = document.querySelector('nav') || document.querySelector('header');
    if (!mainNav) return;

    const applyNavOffset = () => {
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      if (isDesktop) {
        mainNav.style.left = `${SIDEBAR_WIDTH_PX}px`;
        mainNav.style.width = `calc(100% - ${SIDEBAR_WIDTH_PX}px)`;
      } else {
        mainNav.style.left = '';
        mainNav.style.width = '';
      }
    };

    const handleScroll = () => {
      const mobileHeader = mobileHeaderRef.current;
      const currentScrollY = window.scrollY;

      if (currentScrollY < 50) {
        mainNav.style.transform = 'translateY(0)';
        if (mobileHeader) {
          mobileHeader.style.transform = 'translateY(0)';
        }
      } else if (currentScrollY > lastScrollPos.current) {
        mainNav.style.transform = 'translateY(-100%)';
        mainNav.style.transition = 'transform 0.3s ease-in-out';
        if (mobileHeader) {
          mobileHeader.style.transform = 'translateY(-200%)';
          mobileHeader.style.transition = 'transform 0.3s ease-in-out';
        }
      } else {
        mainNav.style.transform = 'translateY(0)';
        if (mobileHeader) {
          mobileHeader.style.transform = 'translateY(0)';
        }
      }

      lastScrollPos.current = currentScrollY;
    };

    applyNavOffset();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', applyNavOffset);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', applyNavOffset);
      if (mainNav) mainNav.style.transform = 'translateY(0)';
      const mobileHeader = mobileHeaderRef.current;
      if (mobileHeader) mobileHeader.style.transform = 'translateY(0)';
      mainNav.style.left = '';
      mainNav.style.width = '';
    };
  }, []);

  useEffect(() => {
    if (!loading && allChapters.length > 0) {
      const activeBtn = document.getElementById(`chapter-${chapterId}`);
      if (activeBtn) activeBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [loading, chapterId, allChapters]);

  useEffect(() => {
    if (!loading && data && containerRef.current && !hasScrolledToPage.current) {
      const pageParam = searchParams?.get('page');
      if (pageParam) {
        const pageNumber = parseInt(pageParam, 10);
        if (!isNaN(pageNumber) && pageNumber > 0) {
          const images = Array.from(containerRef.current.querySelectorAll('img'));
          const targetImage = images[pageNumber - 1];

          if (targetImage) {
            setTimeout(() => {
              const imgAbsoluteMiddle = targetImage.getBoundingClientRect().top + window.scrollY + targetImage.offsetHeight / 2;
              window.scrollTo({ top: imgAbsoluteMiddle - window.innerHeight / 2, behavior: 'smooth' });
            }, 300);
          }
          hasScrolledToPage.current = true;
        }
      }
    }
  }, [loading, data, searchParams]);

  useEffect(() => {
    if (!user || !data || !id || !chapterId) return;
    if (currentPage === 0 || currentPage === lastTrackedPage) return; // Skip if page 0 or already tracked

    // Clear existing timeout
    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current);
    }

    // Set new debounced timeout (500ms delay)
    progressTimeoutRef.current = setTimeout(async () => {
      try {
        await updateProgress({
          seriesId: Number(id),
          chapterId: Number(chapterId),
          pageNumber: currentPage,
          totalPagesInChapter: data.images?.length || 0,
        });
        setLastTrackedPage(currentPage);
      } catch (error) {
        console.error('Failed to update progress:', error);
      }
    }, 500);

    return () => {
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
      }
    };
  }, [user, data, id, chapterId, currentPage, lastTrackedPage]);

  useEffect(() => {
    if (!containerRef.current || !data?.images) return;

    const handleScroll = () => {
      if (!containerRef.current) return;
      const images = Array.from(containerRef.current.querySelectorAll('img'));
      const viewportMiddle = window.scrollY + window.innerHeight / 2;

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const rect = img.getBoundingClientRect();
        const imgMiddle = rect.top + window.scrollY + img.offsetHeight / 2;

        if (imgMiddle >= viewportMiddle - 200 && imgMiddle <= viewportMiddle + 200) {
          setCurrentPage(i + 1);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [data]);

  const currentIndex = allChapters.findIndex((ch) => ch.id === Number(chapterId));
  const prevChapter = allChapters[currentIndex - 1];
  const nextChapter = allChapters[currentIndex + 1];

  const handlePageClick = useCallback((direction: 'next' | 'prev') => {
    if (!containerRef.current) return;
    const images = Array.from(containerRef.current.querySelectorAll('img'));
    const viewportMiddle = window.scrollY + window.innerHeight / 2;

    if (direction === 'next') {
      const nextImg = images.find((img) => {
        const imgAbsoluteMiddle = img.getBoundingClientRect().top + window.scrollY + img.offsetHeight / 2;
        return imgAbsoluteMiddle > viewportMiddle + 20;
      });
      if (nextImg) {
        const imgAbsoluteMiddle = nextImg.getBoundingClientRect().top + window.scrollY + nextImg.offsetHeight / 2;
        window.scrollTo({ top: imgAbsoluteMiddle - window.innerHeight / 2, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    } else {
      const prevImg = [...images].reverse().find((img) => {
        const imgAbsoluteMiddle = img.getBoundingClientRect().top + window.scrollY + img.offsetHeight / 2;
        return imgAbsoluteMiddle < viewportMiddle - 20;
      });
      if (prevImg) {
        const imgAbsoluteMiddle = prevImg.getBoundingClientRect().top + window.scrollY + prevImg.offsetHeight / 2;
        window.scrollTo({ top: imgAbsoluteMiddle - window.innerHeight / 2, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, []);

  const handleBookmarkClick = async () => {
    if (!user) return;
    setBookmarkModalOpen(true);
  };

  const handleRemoveBookmark = async () => {
    if (!user || !id || !chapterId) return;
    try {
      await removeBookmark(Number(id), Number(chapterId));
      setIsBookmarked(false);
      setBookmarkNote('');
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
    }
  };

  const handleBookmarkSuccess = () => {
    setIsBookmarked(true);
    // Refetch bookmark to get latest note
    if (user && id && chapterId) {
      getBookmark(Number(id), Number(chapterId))
        .then((response) => {
          if (response?.bookmark) {
            setBookmarkNote(response.bookmark.note || '');
          }
        })
        .catch((error) => console.error('Failed to fetch bookmark:', error));
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;

      if (loading) return;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        handlePageClick('prev');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        handlePageClick('next');
      } else if (event.key === 'ArrowLeft') {
        if (!prevChapter) return;
        event.preventDefault();
        router.push(`/manga/${id}/read/${prevChapter.id}`);
        window.scrollTo(0, 0);
      } else if (event.key === 'ArrowRight') {
        if (!nextChapter) return;
        event.preventDefault();
        router.push(`/manga/${id}/read/${nextChapter.id}`);
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePageClick, id, loading, nextChapter, prevChapter, router]);

  if (loading) return <div className="loading text-primary p-5 text-center">Loading Chapter...</div>;

  return (
    <div className="reader-root flex bg-background min-h-screen text-primary flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="sidebar hidden md:flex md:w-65 md:h-screen md:fixed md:left-0 md:top-0 md:bg-foreground md:border-r md:border-r-borders md:flex-col md:z-100">
        <div className="sidebar-header px-6 py-4 border-b-borders">
          <h2 className="text-[1.25rem] font-bold mb-4 text-white">Chapter {data?.chapterNumber}</h2>
            <button onClick={() => { router.push(`/manga/${id}`) }} className="mb-4 w-full flex-1 p-2.5 bg-background hover:bg-background/50 border-0 text-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 rounded">Back to Overview</button>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (prevChapter) {
                  router.push(`/manga/${id}/read/${prevChapter.id}`);
                  window.scrollTo(0, 0);
                }
              }}
              disabled={!prevChapter}
              className="flex-1 p-2.5 bg-background hover:bg-background/50 border-0 text-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 rounded"
            >
              Prev
            </button>
            <button
              onClick={() => {
                if (nextChapter) {
                  router.push(`/manga/${id}/read/${nextChapter.id}`);
                  window.scrollTo(0, 0);
                }
              }}
              disabled={!nextChapter}
              className="flex-1 p-2.5 bg-background hover:bg-background/50 border-0 text-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 rounded"
            >
              Next
            </button>
          </div>

          {/* Bookmark Button */}
          {user && (
            <button
              onClick={() => isBookmarked ? handleRemoveBookmark() : handleBookmarkClick()}
              className={`w-full mt-4 p-2.5 flex items-center justify-center gap-2 border-0 rounded cursor-pointer ${
                isBookmarked
                  ? 'bg-accent hover:bg-accent/80 text-white'
                  : 'bg-background hover:bg-background/50 text-primary'
              }`}
            >
              <BookmarkIcon size={18} className={isBookmarked ? 'fill-white' : ''} />
              {isBookmarked ? 'Remove Bookmark' : 'Bookmark Chapter'}
            </button>
          )}
          {/* Key */}
          <div className="mt-4 text-sm text-primary/70">
            <p className="mb-1">Keybinds:</p>
            <ul className="list-disc list-inside">
              <li>↑ / ↓ : Scroll Pages</li>
              <li>← / → : Prev/Next Chapter</li>
            </ul>
          </div>
        </div>
        <div className="chapter-list-scroll flex-1 overflow-y-auto p-4">
          <div className="grid-list grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {allChapters.map((ch) => (
              <button
                key={ch.id}
                id={`chapter-${ch.id}`}
                onClick={() => {
                  router.push(`/manga/${id}/read/${ch.id}`);
                  window.scrollTo(0, 0);
                  setSidebarOpen(false);
                }}
                className={`p-[10px_2px] text-[0.75rem] border cursor-pointer rounded-sm text-primary ${
                  ch.id === Number(chapterId) ? 'font-bold bg-accent border-accent' : 'font-normal bg-background hover:bg-background/50 border-background'
                }`}
              >
                {ch.chapterNumber}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
          <aside className="sidebar fixed top-0 left-0 h-screen w-72 bg-foreground border-r border-r-borders flex flex-col z-50 md:hidden">
            <div className="sidebar-header px-6 py-4 border-b border-borders flex justify-between items-center">
              <h2 className="text-[1.25rem] font-bold text-white">Chapter {data?.chapterNumber}</h2>
              <button onClick={() => setSidebarOpen(false)} className="text-primary hover:text-accent">
                <X className="size-6" />
              </button>
            </div>
            <div className="chapter-list-scroll flex-1 overflow-y-auto p-4">
              <div className="grid-list grid grid-cols-1 gap-2">
                {allChapters.map((ch) => (
                  <button
                    key={ch.id}
                    id={`chapter-${ch.id}`}
                    onClick={() => {
                      router.push(`/manga/${id}/read/${ch.id}`);
                      window.scrollTo(0, 0);
                      setSidebarOpen(false);
                    }}
                    className={`p-2 text-sm border cursor-pointer rounded text-primary ${
                      ch.id === Number(chapterId) ? 'font-bold bg-accent border-accent' : 'font-normal bg-background hover:bg-background/50 border-background'
                    }`}
                  >
                    Chapter {ch.chapterNumber}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Page Progress Indicator - Right Side */}
      <div className="fixed right-0 top-0 h-screen w-2 bg-foreground/30 z-50 pointer-events-none">
        <div
          className="w-full bg-accent transition-all duration-200 ease-out"
          style={{
            height: data?.images ? `${((currentPage / data.images.length) * 100).toFixed(1)}%` : '0%',
          }}
        />
        {/* Page number indicator */}
        {currentPage > 0 && data?.images && (
          <div
            className="absolute top-0 right-0 transform -translate-y-1/2 bg-accent text-white text-xs font-bold px-2 py-1 rounded-l shadow-lg pointer-events-auto"
            style={{ top: `${(currentPage / data.images.length) * 100}%` }}
          >
            {currentPage}/{data.images.length}
          </div>
        )}
      </div>

      {/* Mobile Header with Menu */}
      <div
        ref={mobileHeaderRef}
        id="mobile-reader-header"
        className="md:hidden fixed top-16 left-0 right-0 bg-foreground/90 border-b border-borders px-4 py-3 z-40 flex items-center justify-between transition-transform duration-300"
      >
        <button onClick={() => setSidebarOpen(true)} className="text-primary hover:text-accent p-2">
          <MenuIcon className="size-6" />
        </button>
        <span className="text-sm font-semibold">
          {currentPage}/{data?.images?.length || 0}
        </span>
        {user && (
          <button
            onClick={() => isBookmarked ? handleRemoveBookmark() : handleBookmarkClick()}
            className="text-primary hover:text-accent p-2"
            title={isBookmarked ? 'Remove Bookmark' : 'Bookmark Chapter'}
          >
            <BookmarkIcon
              className="size-6"
              fill={isBookmarked ? 'currentColor' : 'none'}
            />
          </button>
        )}
      </div>

      <main className="content w-full md:py-18.25 md:ml-65 md:w-[calc(100%-260px)] pt-24 md:pt-18.25 pb-20 md:pb-0 relative flex flex-col items-center">
        <div className="click-zones fixed top-0 right-0 bottom-0 left-0 md:left-65 flex z-10 pointer-events-none pt-24 md:pt-0">
          <div
            onClick={() => handlePageClick('prev')}
            className="prev-zone flex-1 pointer-events-auto cursor-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2232%22%20height%3D%2232%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%2215%2018%209%2012%2015%206%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E'),pointer]"
          />
          <div
            onClick={() => handlePageClick('next')}
            className="next-zone flex-1 pointer-events-auto cursor-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2232%22%20height%3D%2232%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%229%2018%2015%2012%209%206%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E'),pointer]"
          />
        </div>

        <div ref={containerRef} className="image-stack w-full max-w-212.5 bg-black z-5">
          {data?.images?.map((src, index) => (
            <img
              key={index}
              src={src}
              alt={`Page ${index + 1}`}
              className="manga-page w-full h-auto block"
              loading={index < 3 ? 'eager' : 'lazy'}
            />
          ))}
        </div>

        <div className="footer-nav py-20 text-center z-100 hidden md:block">
          {nextChapter && (
            <button
              onClick={() => {
                router.push(`/manga/${id}/read/${nextChapter.id}`);
                window.scrollTo(0, 0);
              }}
              className="px-12 py-4 bg-[#3b82f6] text-white border-none rounded-md text-[1.1rem] font-bold cursor-pointer"
            >
              Read Chapter {nextChapter.chapterNumber} →
            </button>
          )}
        </div>
      </main>

      <BookmarkModal
        isOpen={bookmarkModalOpen}
        onClose={() => setBookmarkModalOpen(false)}
        seriesId={Number(id)}
        chapterId={Number(chapterId)}
        chapterTitle={data?.title || `Chapter ${data?.chapterNumber}`}
        existingNote={bookmarkNote}
        onSuccess={handleBookmarkSuccess}
      />
    </div>
  );
}
