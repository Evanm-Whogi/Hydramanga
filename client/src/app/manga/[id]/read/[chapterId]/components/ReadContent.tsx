"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetchMangaPages, updateProgress, recordReadingTime } from '@/services/mangaService';
import { getBookmark, removeBookmark } from '@/services/bookmarkService';
import { useUser } from '@/providers/UserProvider';
import { MenuIcon, X, BookmarkIcon, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { useChapterViewTracking } from '@/hooks/useViewTracking';
import { useMangaImportProgress } from '@/hooks/useMangaImportProgress';
import { updateImportProgressToast, dismissImportProgressToast } from '@/components/ImportProgressToast';
import BookmarkModal from '@/components/BookmarkModal';
import ReaderSettingsModal from './ReaderSettingsModal';
import { trackPageSwitch, trackChapterCompleted, trackBookmarkAction } from '@/lib/analytics';
import { 
  ReaderSettings, 
  loadReaderSettings, 
  getAutoScrollSpeed,
} from '@/lib/readerSettings';

const SIDEBAR_WIDTH_PX = 260;

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

  // Chapter data
  const [data, setData] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Page tracking
  const [currentPage, setCurrentPage] = useState(0);
  const [lastTrackedPage, setLastTrackedPage] = useState(0);
  
  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  
  // Bookmark state
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [bookmarkModalOpen, setBookmarkModalOpen] = useState(false);
  
  // Reader settings
  const [settings, setSettings] = useState<ReaderSettings>(() => loadReaderSettings());
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileHeaderRef = useRef<HTMLDivElement>(null);
  const lastScrollPos = useRef(0);
  const hasScrolledToPage = useRef(false);
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Reading time tracking
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef(0);
  const [initialProgressReceived, setInitialProgressReceived] = useState(false);
  const [wasActiveOnLoad, setWasActiveOnLoad] = useState(false);

  // Track chapter view
  useChapterViewTracking(
    id ? Number(id) : 0, 
    chapterId ? Number(chapterId) : 0, 
    mangaTitle, 
    data?.chapterNumber
  );

  // Track manga import progress
  const { progress } = useMangaImportProgress(id ? Number(id) : null, {
    enabled: true,
    mangaTitle: mangaTitle,
    onProgress: (progressData: any) => {
      if (progressData.lastDownloadedChapter) {
        setAllChapters((prev) => {
          const exists = prev.some((ch) => ch.id === progressData.lastDownloadedChapter?.id);
          if (!exists && progressData.lastDownloadedChapter) {
            const newChapter = {
              id: progressData.lastDownloadedChapter.id || Math.random(),
              seriesId: Number(id),
              chapterNumber: progressData.lastDownloadedChapter.chapterNumber,
              volumeNumber: null,
              title: progressData.lastDownloadedChapter.title,
              localPath: '',
              images: [],
            } as Chapter;
            return [newChapter, ...prev].sort((a, b) => 
              parseFloat(a.chapterNumber || '0') - parseFloat(b.chapterNumber || '0')
            );
          }
          return prev;
        });
      }
    },
  });

  // Calculate padding and scale values (negative = zoom in, positive = zoom out)
  const paddingValue = useMemo(() => {
    // Positive values add padding (zoom out)
    if (settings.readerPadding >= 0) {
      return `${settings.readerPadding * 20}%`;
    }
    // Negative values don't add padding
    return '0%';
  }, [settings.readerPadding]);

  const imageScale = useMemo(() => {
    // Negative values scale up (zoom in): -1 = 2x scale, 0 = 1x scale
    if (settings.readerPadding < 0) {
      return 1 + Math.abs(settings.readerPadding);
    }
    // Positive values don't scale
    return 1;
  }, [settings.readerPadding]);

  // Get container styles
  const containerStyles = useMemo((): React.CSSProperties => {
    return {
      paddingLeft: paddingValue,
      paddingRight: paddingValue,
      backgroundColor: 'transparent',
    };
  }, [paddingValue]);

  // Get image styles
  const getImageStyle = useMemo((): React.CSSProperties => {
    if (imageScale !== 1) {
      return {
        transform: `scale(${imageScale})`,
        transformOrigin: 'center center',
      };
    }
    return {};
  }, [imageScale]);

  // Get image class name
  const getImageClassName = 'manga-page w-full h-auto block';

  // Get current and adjacent chapters
  const currentIndex = useMemo(() => 
    allChapters.findIndex((ch) => ch.id === Number(chapterId)), 
    [allChapters, chapterId]
  );
  const prevChapter = useMemo(() => allChapters[currentIndex - 1], [allChapters, currentIndex]);
  const nextChapter = useMemo(() => allChapters[currentIndex + 1], [allChapters, currentIndex]);

  // Send reading time to backend
  const sendReadingTime = useCallback(async (seconds: number) => {
    if (!user || !id || !chapterId || seconds <= 0) return;
    try {
      await recordReadingTime({
        seriesId: Number(id),
        chapterId: Number(chapterId),
        seconds: seconds,
      });
    } catch (err) {
      console.error('Failed to record reading time', err);
    }
  }, [user, id, chapterId]);

  // Handle bookmark actions
  const handleBookmarkClick = useCallback(() => {
    if (!user) return;
    setBookmarkModalOpen(true);
  }, [user]);

  const handleRemoveBookmark = useCallback(async () => {
    if (!user || !id || !chapterId) return;
    try {
      await removeBookmark(Number(id), Number(chapterId));
      setIsBookmarked(false);
      const removedNote = bookmarkNote;
      setBookmarkNote('');
      trackBookmarkAction('removed', id as string, mangaTitle, chapterId as string, data?.chapterNumber, removedNote);
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
    }
  }, [user, id, chapterId, bookmarkNote, mangaTitle, data?.chapterNumber]);

  const handleBookmarkSuccess = useCallback(() => {
    setIsBookmarked(true);
    if (user && id && chapterId) {
      getBookmark(Number(id), Number(chapterId))
        .then((response: any) => {
          if (response?.bookmark) {
            setBookmarkNote(response.bookmark.note || '');
          }
        })
        .catch((error: any) => console.error('Failed to fetch bookmark:', error));
    }
  }, [user, id, chapterId]);

  // Navigate to chapter
  const navigateToChapter = useCallback((chapter: Chapter) => {
    if (data && chapter.id !== Number(chapterId)) {
      trackChapterCompleted(id || '', mangaTitle, data.chapterNumber);
    }
    router.push(`/manga/${id}/read/${chapter.id}`);
    window.scrollTo(0, 0);
  }, [router, id, data, chapterId, mangaTitle]);

  // Page navigation
  const handlePageClick = useCallback((direction: 'next' | 'prev') => {
    // Default scroll navigation
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
  }, [data?.images]);

  // Toggle controls visibility (for tap zones center click)
  const toggleControls = useCallback(() => {
    setControlsVisible(prev => !prev);
    
    // Auto-hide controls after 3 seconds
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  }, []);

  // Handle tap zone clicks
  const handleTapZoneClick = useCallback((zone: 'left' | 'right' | 'center') => {
    if (!settings.tapZones) return;
    
    if (zone === 'center') {
      toggleControls();
    } else if (zone === 'left') {
      handlePageClick('prev');
    } else {
      handlePageClick('next');
    }
  }, [settings.tapZones, toggleControls, handlePageClick]);

  // Settings change handler
  const handleSettingsChange = useCallback((newSettings: ReaderSettings) => {
    setSettings(newSettings);
  }, []);

  // Load chapter data
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

  // Fetch bookmark status
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

  // Show/update progress toast
  useEffect(() => {
    if (!progress || !mangaTitle) return;

    const isActiveStatus = progress.status === 'scanning' || progress.status === 'downloading';
    const isTerminalStatus = progress.status === 'completed' || progress.status === 'failed';

    if (!initialProgressReceived) {
      setInitialProgressReceived(true);
      if (isActiveStatus) {
        setWasActiveOnLoad(true);
        updateImportProgressToast(id ? Number(id) : 0, mangaTitle, progress);
      }
      return;
    }

    if (isActiveStatus) {
      setWasActiveOnLoad(true);
      updateImportProgressToast(id ? Number(id) : 0, mangaTitle, progress);
    } else if (wasActiveOnLoad && isTerminalStatus) {
      updateImportProgressToast(id ? Number(id) : 0, mangaTitle, progress);
    }
  }, [progress, id, mangaTitle, initialProgressReceived, wasActiveOnLoad]);

  // Cleanup toast on unmount
  useEffect(() => {
    return () => {
      if (id) {
        dismissImportProgressToast(Number(id));
      }
    };
  }, [id]);

  // Reading timer
  useEffect(() => {
    setElapsedSeconds(0);
    lastSentRef.current = 0;
    if (!user || !id || !chapterId) return;

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (elapsedSeconds > 0) {
        sendReadingTime(elapsedSeconds);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id, chapterId]);

  // Send reading time periodically
  useEffect(() => {
    if (!user || !id || !chapterId) return;
    if (elapsedSeconds > 0 && elapsedSeconds - lastSentRef.current >= 10) {
      sendReadingTime(elapsedSeconds - lastSentRef.current);
      lastSentRef.current = elapsedSeconds;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds]);

  // Auto-scroll functionality
  useEffect(() => {
    if (settings.autoScroll === 'off') {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
      return;
    }

    const speed = getAutoScrollSpeed(settings.autoScroll);
    const pixelsPerFrame = speed / 60; // 60fps

    autoScrollIntervalRef.current = setInterval(() => {
      window.scrollBy({ top: pixelsPerFrame, behavior: 'auto' });
    }, 1000 / 60);

    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, [settings.autoScroll]);

  // Pause auto-scroll on user interaction
  useEffect(() => {
    if (settings.autoScroll === 'off') return;

    const pauseAutoScroll = () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
    };

    window.addEventListener('wheel', pauseAutoScroll, { passive: true });
    window.addEventListener('touchmove', pauseAutoScroll, { passive: true });
    window.addEventListener('keydown', pauseAutoScroll);

    return () => {
      window.removeEventListener('wheel', pauseAutoScroll);
      window.removeEventListener('touchmove', pauseAutoScroll);
      window.removeEventListener('keydown', pauseAutoScroll);
    };
  }, [settings.autoScroll]);

  // Handle navigation offset for main nav
  useEffect(() => {
    const mainNav = document.querySelector('nav') || document.querySelector('header');
    if (!mainNav) return;

    const applyNavOffset = () => {
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      if (isDesktop) {
        if (sidebarCollapsed) {
          mainNav.style.left = '0';
          mainNav.style.width = '100%';
        } else {
          mainNav.style.left = `${SIDEBAR_WIDTH_PX}px`;
          mainNav.style.width = `calc(100% - ${SIDEBAR_WIDTH_PX}px)`;
        }
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
      if (mainNav) {
        mainNav.style.transform = 'translateY(0)';
        mainNav.style.left = '';
        mainNav.style.width = '';
      }
      const mobileHeader = mobileHeaderRef.current;
      if (mobileHeader) mobileHeader.style.transform = 'translateY(0)';
    };
  }, [sidebarCollapsed]);

  // Scroll to active chapter in sidebar
  useEffect(() => {
    if (!loading && allChapters.length > 0) {
      const activeBtn = document.getElementById(`chapter-${chapterId}`);
      if (activeBtn) activeBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [loading, chapterId, allChapters]);

  // Scroll to page from URL param
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

  // Update progress tracking
  useEffect(() => {
    if (!user || !data || !id || !chapterId) return;
    if (currentPage === 0 || currentPage === lastTrackedPage) return;

    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current);
    }

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

  // Track current page based on scroll position
  useEffect(() => {
    // Default scroll-based tracking
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
          const newPage = i + 1;
          if (newPage !== currentPage) {
            setCurrentPage(newPage);
            if (newPage % 5 === 0 || newPage === data.images.length) {
              trackPageSwitch(id || '', data.chapterNumber, newPage, data.images.length);
            }
          }
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [data, id, currentPage]);

  // Keyboard navigation
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
        navigateToChapter(prevChapter);
      } else if (event.key === 'ArrowRight') {
        if (!nextChapter) return;
        event.preventDefault();
        navigateToChapter(nextChapter);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePageClick, loading, nextChapter, prevChapter, navigateToChapter]);

  if (loading) {
    return <div className="loading text-primary p-5 text-center">Loading Chapter...</div>;
  }

  // Render progress indicator based on position
  const renderProgressIndicator = () => {
    if (settings.progressIndicator === 'off' || !data?.images) return null;

    const percentage = ((currentPage / data.images.length) * 100).toFixed(1);
    const label = `${currentPage}/${data.images.length}`;

    if (settings.progressIndicator === 'right') {
      return (
        <div className="fixed right-0 top-0 h-screen w-2 bg-foreground/30 z-50 pointer-events-none">
          <div
            className="w-full bg-accent transition-all duration-200 ease-out"
            style={{ height: `${percentage}%` }}
          />
          {currentPage > 0 && (
            <div
              className="absolute top-0 right-0 transform -translate-y-1/2 bg-accent text-white text-xs font-bold px-2 py-1 rounded-l shadow-lg pointer-events-auto"
              style={{ top: `${percentage}%` }}
            >
              {label}
            </div>
          )}
        </div>
      );
    }

    if (settings.progressIndicator === 'top') {
      return (
        <div className="fixed top-0 left-0 right-0 h-1 bg-foreground/30 z-50 pointer-events-none">
          <div
            className="h-full bg-accent transition-all duration-200 ease-out"
            style={{ width: `${percentage}%` }}
          />
          {currentPage > 0 && (
            <div className="absolute top-2 right-4 bg-accent text-white text-xs font-bold px-2 py-1 rounded shadow-lg pointer-events-auto">
              {label}
            </div>
          )}
        </div>
      );
    }

    if (settings.progressIndicator === 'bottom') {
      return (
        <div className="fixed bottom-0 left-0 right-0 h-1 bg-foreground/30 z-50 pointer-events-none">
          <div
            className="h-full bg-accent transition-all duration-200 ease-out"
            style={{ width: `${percentage}%` }}
          />
          {currentPage > 0 && (
            <div className="absolute bottom-2 right-4 bg-accent text-white text-xs font-bold px-2 py-1 rounded shadow-lg pointer-events-auto">
              {label}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="reader-root flex bg-background min-h-screen text-primary flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className={`sidebar hidden md:flex md:h-screen md:fixed md:left-0 md:top-0 md:bg-foreground md:border-r md:border-r-borders md:flex-col md:z-100 md:transition-all md:duration-300 ${
        sidebarCollapsed ? 'md:w-0 md:overflow-hidden' : 'md:w-65'
      }`}>
        <div className="sidebar-header px-6 py-4 border-b border-borders">
          <h2 className="text-[1.25rem] font-bold mb-4 text-white">Chapter {data?.chapterNumber}</h2>
          
          <button 
            onClick={() => router.push(`/manga/${id}`)} 
            className="mb-4 w-full p-2.5 bg-background hover:bg-background/50 border-0 text-primary cursor-pointer rounded"
          >
            Back to Overview
          </button>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => prevChapter && navigateToChapter(prevChapter)}
              disabled={!prevChapter}
              className="flex-1 p-2.5 bg-background hover:bg-background/50 border-0 text-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 rounded"
            >
              Prev
            </button>
            <button
              onClick={() => nextChapter && navigateToChapter(nextChapter)}
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
              className={`w-full p-2.5 flex items-center justify-center gap-2 border-0 rounded cursor-pointer ${
                isBookmarked
                  ? 'bg-accent hover:bg-accent/80 text-white'
                  : 'bg-background hover:bg-background/50 text-primary'
              }`}
            >
              <BookmarkIcon size={18} className={isBookmarked ? 'fill-white' : ''} />
              {isBookmarked ? 'Remove Bookmark' : 'Bookmark Chapter'}
            </button>
          )}

          {/* Settings Button */}
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="w-full mt-2 p-2.5 flex items-center justify-center gap-2 bg-background hover:bg-background/50 text-primary border-0 rounded cursor-pointer"
          >
            <Settings size={18} />
            Reader Settings
          </button>

          {/* Keybinds */}
          <div className="mt-4 text-sm text-primary/70">
            <p className="mb-1">Keybinds:</p>
            <ul className="list-disc list-inside text-xs">
              <li>↑ / ↓ : Scroll Pages</li>
              <li>← / → : Prev/Next Chapter</li>
            </ul>
          </div>
        </div>

        {/* Chapter List */}
        <div className="chapter-list-scroll flex-1 overflow-y-auto p-4">
          <div className="grid-list grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {allChapters.map((ch) => (
              <button
                key={ch.id}
                id={`chapter-${ch.id}`}
                onClick={() => navigateToChapter(ch)}
                className={`p-[10px_2px] text-[0.75rem] border cursor-pointer rounded-sm text-primary ${
                  ch.id === Number(chapterId) 
                    ? 'font-bold bg-accent border-accent' 
                    : 'font-normal bg-background hover:bg-background/50 border-background'
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
                    onClick={() => {
                      navigateToChapter(ch);
                      setSidebarOpen(false);
                    }}
                    className={`p-2 text-sm border cursor-pointer rounded text-primary ${
                      ch.id === Number(chapterId) 
                        ? 'font-bold bg-accent border-accent' 
                        : 'font-normal bg-background hover:bg-background/50 border-background'
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

      {/* Progress Indicator */}
      {renderProgressIndicator()}

      {/* Sidebar Collapse/Expand Button */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="hidden md:flex md:fixed md:top-1/2 cursor-pointer md:-translate-y-1/2 md:bg-foreground md:hover:bg-background md:text-primary md:border md:border-borders md:rounded-full md:p-2 md:z-50 md:transition-all md:duration-300"
        style={sidebarCollapsed ? { left: '8px' } : { left: `${SIDEBAR_WIDTH_PX + 8}px` }}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Mobile Header */}
      <div
        ref={mobileHeaderRef}
        className="md:hidden fixed top-16 left-0 right-0 bg-foreground/90 border-b border-borders px-4 py-3 z-40 flex items-center justify-between transition-transform duration-300"
      >
        <button onClick={() => setSidebarOpen(true)} className="text-primary hover:text-accent p-2">
          <MenuIcon className="size-6" />
        </button>
        <span className="text-sm font-semibold">
          {currentPage}/{data?.images?.length || 0}
        </span>
        <div className="flex gap-2">
          {user && (
            <button
              onClick={() => isBookmarked ? handleRemoveBookmark() : handleBookmarkClick()}
              className="text-primary hover:text-accent p-2"
            >
              <BookmarkIcon className="size-6" fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
          )}
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="text-primary hover:text-accent p-2"
          >
            <Settings className="size-6" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className={`content w-full md:py-18.25 pt-24 md:pt-18.25 pb-20 md:pb-0 relative flex flex-col items-center transition-all duration-300 ${
        sidebarCollapsed ? 'md:ml-0 md:w-full' : 'md:ml-65 md:w-[calc(100%-260px)]'
      }`}>
        {/* Tap Zones */}
        {settings.tapZones && (
          <div className={`click-zones fixed top-0 right-0 bottom-0 left-0 flex z-10 pointer-events-none pt-24 md:pt-0 transition-all duration-300 ${
            sidebarCollapsed ? 'md:left-0' : 'md:left-65'
          }`}>
            <div
              onClick={() => handleTapZoneClick('left')}
              className="prev-zone flex-1 pointer-events-auto cursor-w-resize"
            />
            <div
              onClick={() => handleTapZoneClick('center')}
              className="center-zone flex-1 pointer-events-auto cursor-pointer"
            />
            <div
              onClick={() => handleTapZoneClick('right')}
              className="next-zone flex-1 pointer-events-auto cursor-e-resize"
            />
          </div>
        )}

        {/* Image Container */}
        <div 
          ref={containerRef} 
          className="image-stack w-full max-w-212.5 z-5"
          style={containerStyles}
        >
          {data?.images?.map((src, index) => (
            <img
              key={index}
              src={src}
              alt={`Page ${index + 1}`}
              className={getImageClassName}
              style={getImageStyle}
              loading={index < 3 ? 'eager' : 'lazy'}
            />
          ))}
        </div>

        {/* Footer Navigation */}
        <div className="footer-nav py-20 text-center z-100 hidden md:block">
          {nextChapter ? (
            <button
              onClick={() => navigateToChapter(nextChapter)}
              className="px-12 py-4 bg-accent hover:bg-accent/80 text-white border-none rounded-md text-[1.1rem] font-bold cursor-pointer transition-colors"
            >
              Read Chapter {nextChapter.chapterNumber} →
            </button>
          ) : (
            <div className="flex flex-col py-2">
                <span className="text-primary/70">You have reached the end of available chapters.</span>
                <button className="mt-5 ml-2 text-accent hover:underline cursor-pointer" onClick={() => router.push(`/manga/${id}`)}>Return to Manga Overview</button>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <BookmarkModal
        isOpen={bookmarkModalOpen}
        onClose={() => setBookmarkModalOpen(false)}
        seriesId={Number(id)}
        chapterId={Number(chapterId)}
        chapterTitle={data?.title || `Chapter ${data?.chapterNumber}`}
        existingNote={bookmarkNote}
        onSuccess={handleBookmarkSuccess}
        mangaTitle={mangaTitle}
        chapterNumber={data?.chapterNumber}
      />

      <ReaderSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
}
