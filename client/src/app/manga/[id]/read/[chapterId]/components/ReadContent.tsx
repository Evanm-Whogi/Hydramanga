"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetchMangaPages, updateProgress, recordReadingTime, markChapterAsRead } from '@/services/mangaService';
import { useUser } from '@/providers/UserProvider';
import { MenuIcon, X, ChevronLeft, ChevronRight, Settings, Maximize, Minimize, Home, BookOpen, MessageSquare, Keyboard } from 'lucide-react';
import { useChapterViewTracking } from '@/hooks/useViewTracking';
import { useMangaImportProgress } from '@/hooks/useMangaImportProgress';
import { updateImportProgressToast, dismissImportProgressToast } from '@/components/ImportProgressToast';
import { showContinuousModeToast, dismissContinuousModeToast } from '@/components/ContinuousModeToast';
import ReaderSettingsModal from './ReaderSettingsModal';
import KeybindsModal from './KeybindsModal';
import Comments from '@/app/manga/[id]/components/Comments';
import { 
  ReaderSettings, 
  loadReaderSettings, 
  saveReaderSettings,
  getAutoScrollSpeed,
} from '@/lib/readerSettings';

const SIDEBAR_WIDTH_PX = 260;
const COMMENTS_SIDEBAR_WIDTH_PX = 525;
const EAGER_COUNT = 5;
const SIDEBAR_BTN = "p-2.5 bg-background hover:bg-background/50 border-0 text-primary cursor-pointer rounded flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-30";
const SIDEBAR_BTN_HALF = `${SIDEBAR_BTN} w-1/2 shadow-md`;
const SIDEBAR_BTN_FULL = `${SIDEBAR_BTN} w-full shadow-md`;

const LazyMangaPage = React.memo(function LazyMangaPage({
  src,
  index,
  alt,
  className,
  style,
}: {
  src: string;
  index: number;
  alt: string;
  className: string;
  style: React.CSSProperties;
}) {
  const eager = index < EAGER_COUNT;
  const [activeSrc, setActiveSrc] = useState(eager ? src : '');
  const [loaded, setLoaded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (eager) return;
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActiveSrc(src);
          io.disconnect();
        }
      },
      // Start loading 2 full viewport heights before the image enters view
      { rootMargin: '200% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager, src]);

  return (
    // The wrapper is always in the DOM so querySelectorAll('img') navigation
    // can still measure its position via the wrapper's bounding rect.
    <div ref={wrapperRef} className="w-full relative" style={{ minHeight: loaded ? undefined : '600px' }}>
      {/* Skeleton placeholder until the image is loaded */}
      {!loaded && (
        <div className="absolute inset-0 bg-foreground/20 animate-pulse" style={{ minHeight: '600px' }} />
      )}
      <img
        // img is always in the DOM; before src is set it is visually hidden
        // but its position still equals the wrapper's position for scroll math.
        src={activeSrc || undefined}
        alt={alt}
        className={className}
        style={{
          ...style,
          // Only show after fully loaded so the skeleton stays visible during fetch
          visibility: loaded ? 'visible' : 'hidden',
          position: loaded ? 'static' : 'absolute',
        }}
        onLoad={() => setLoaded(true)}
        referrerPolicy="strict-origin-when-cross-origin"
        fetchPriority={eager ? 'high' : 'low'}
        decoding={eager ? 'sync' : 'async'}
      />
    </div>
  );
});

interface Chapter {
  id: number;
  seriesId: number;
  title: string | null;
  chapterNumber: string;
  volumeNumber: string | null;
  storagePrefix: string;
  images: string[];
  pageCount?: number;
  allChapters?: Chapter[];
  isSinglePageSeries?: boolean;
  mergedPages?: {
    chapterId: number;
    chapterNumber: string;
    src: string;
  }[] | null;
}

interface ImageItem {
  src: string;
  chapterId: number;
  chapterNumber: string;
  pageNumber: number;
  totalPagesInChapter: number;
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
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [keybindsModalOpen, setKeybindsModalOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  
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
  const lastActiveChapterRef = useRef<number | null>(null);
  const hasTrackedContinuousRef = useRef(false);
  const wasMergedModeRef = useRef(false);
  const mobileChapterListRef = useRef<HTMLDivElement | null>(null);
  const readerRootRef = useRef<HTMLDivElement>(null);

  const isHorizontalMode = settings.readingDirection === 'ltr' || settings.readingDirection === 'rtl';

  // Reading time tracking
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedSecondsRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef(0);
  const [initialProgressReceived, setInitialProgressReceived] = useState(false);
  const [wasActiveOnLoad, setWasActiveOnLoad] = useState(false);

  // Track chapter view
  useChapterViewTracking(
    id ? Number(id) : 0,
    chapterId ? Number(chapterId) : 0,
    mangaTitle,
    data?.chapterNumber,
    Boolean(user) // guests can't hit the auth-only track-view endpoint; skip to avoid a 401 -> login redirect
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
              storagePrefix: '',
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
      display: 'flex',
      flexDirection: 'column',
      gap: `${settings.imageGap}px`,
    };
  }, [paddingValue, settings.imageGap]);

  // Get image styles (scale, greyscale, dim)
  const getImageStyle = useMemo((): React.CSSProperties => {
    const style: React.CSSProperties = {};
    if (imageScale !== 1) {
      style.transform = `scale(${imageScale})`;
      style.transformOrigin = 'center center';
    }
    const filters: string[] = [];
    if (settings.greyscale) filters.push('grayscale(100%)');
    if (settings.dimPages && settings.dimLevel > 0) {
      const brightness = 1 - (settings.dimLevel / 100) * 0.6;
      filters.push(`brightness(${brightness})`);
    }
    if (filters.length > 0) style.filter = filters.join(' ');
    return style;
  }, [imageScale, settings.greyscale, settings.dimPages, settings.dimLevel]);

  // Get image class name
  const getImageClassName = 'manga-page w-full h-auto block';

  const isMergedMode = Boolean(
    data?.isSinglePageSeries
    && data?.mergedPages?.length
    && settings.continuousMode
  );

  const imageItems = useMemo<ImageItem[]>(() => {
    if (isMergedMode && data?.mergedPages?.length) {
      return data.mergedPages.map((page) => ({
        src: page.src,
        chapterId: page.chapterId,
        chapterNumber: page.chapterNumber,
        pageNumber: 1,
        totalPagesInChapter: 1,
      }));
    }

    if (data?.images?.length) {
      return data.images.map((src, index) => ({
        src,
        chapterId: Number(chapterId),
        chapterNumber: data.chapterNumber,
        pageNumber: index + 1,
        totalPagesInChapter: data.images.length,
      }));
    }

    return [];
  }, [isMergedMode, data, chapterId]);

  const totalPages = imageItems.length;

  const activeChapterId = useMemo(() => {
    if (isMergedMode) {
      const activeItem = imageItems[currentPage - 1];
      return activeItem?.chapterId ?? Number(chapterId);
    }
    return Number(chapterId);
  }, [isMergedMode, imageItems, currentPage, chapterId]);

  const activeChapterNumber = useMemo(() => {
    if (isMergedMode) {
      const activeItem = imageItems[currentPage - 1];
      return activeItem?.chapterNumber || data?.chapterNumber;
    }
    return data?.chapterNumber;
  }, [isMergedMode, imageItems, currentPage, data?.chapterNumber]);

  const enableContinuousMode = useCallback(() => {
    const updated = { ...settings, continuousMode: true };
    setSettings(updated);
    saveReaderSettings(updated);
  }, [settings, id, mangaTitle]);

  // Get current and adjacent chapters
  const currentIndex = useMemo(() => 
    allChapters.findIndex((ch) => ch.id === activeChapterId), 
    [allChapters, activeChapterId]
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

  const scrollToImageIndex = useCallback((index: number) => {
    if (!containerRef.current) return;
    const images = Array.from(containerRef.current.querySelectorAll('img'));
    const targetImage = images[index];

    if (targetImage) {
      const imgAbsoluteMiddle = targetImage.getBoundingClientRect().top + window.scrollY + targetImage.offsetHeight / 2;
      window.scrollTo({ top: imgAbsoluteMiddle - window.innerHeight / 2, behavior: 'smooth' });
    }
  }, []);

  const scrollToMergedChapter = useCallback((targetChapterId: number) => {
    if (!isMergedMode) return;
    const index = imageItems.findIndex((item) => item.chapterId === targetChapterId);
    if (index >= 0) scrollToImageIndex(index);
  }, [isMergedMode, imageItems, scrollToImageIndex]);

  // Navigate to chapter
  const navigateToChapter = useCallback((chapter: Chapter) => {
    if (isNavigating) return;
    
    if (isMergedMode) {
      scrollToMergedChapter(chapter.id);
      return;
    }
    
    if (data && chapter.id !== Number(chapterId)) {
    }
    
    setIsNavigating(true);
    router.push(`/manga/${id}/read/${chapter.id}`);
    window.scrollTo(0, 0);
  }, [isNavigating, isMergedMode, scrollToMergedChapter, data, chapterId, id, mangaTitle, router]);

  // Page navigation
  const goToPageIndex = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, index));
    if (isHorizontalMode) {
      setCurrentPage(clamped + 1);
      return;
    }
    scrollToImageIndex(clamped);
  }, [totalPages, isHorizontalMode, scrollToImageIndex]);

  const handleHorizontalPageNav = useCallback((direction: 'next' | 'prev') => {
    const isRtl = settings.readingDirection === 'rtl';
    const delta = direction === 'next' ? 1 : -1;
    const actualDelta = isRtl ? -delta : delta;
    goToPageIndex((currentPage - 1) + actualDelta);
  }, [settings.readingDirection, currentPage, goToPageIndex]);

  const handlePageClick = useCallback((direction: 'next' | 'prev') => {
    if (isHorizontalMode) {
      handleHorizontalPageNav(direction);
      return;
    }

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
  }, [isHorizontalMode, handleHorizontalPageNav]);

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
      return;
    }

    if (isHorizontalMode) {
      const isRtl = settings.readingDirection === 'rtl';
      if (zone === 'left') {
        handleHorizontalPageNav(isRtl ? 'next' : 'prev');
      } else {
        handleHorizontalPageNav(isRtl ? 'prev' : 'next');
      }
      return;
    }

    if (zone === 'left') {
      handlePageClick('prev');
    } else {
      handlePageClick('next');
    }
  }, [settings.tapZones, settings.readingDirection, isHorizontalMode, toggleControls, handleHorizontalPageNav, handlePageClick]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen toggle failed', err);
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Settings change handler
  const handleSettingsChange = useCallback((newSettings: ReaderSettings) => {
    setSettings(newSettings);
  }, []);

  useEffect(() => {
    if (!id || !data?.isSinglePageSeries) return;

    if (settings.continuousMode) {
      dismissContinuousModeToast(Number(id));
      return;
    }

    const storageKey = `continuous-mode-prompted-${id}`;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(storageKey)) return;

    localStorage.setItem(storageKey, '1');
    showContinuousModeToast({
      mangaId: Number(id),
      mangaTitle,
      onEnable: enableContinuousMode,
    });
  }, [id, data?.isSinglePageSeries, settings.continuousMode, mangaTitle, enableContinuousMode]);

  useEffect(() => {
    if (isMergedMode && id && !hasTrackedContinuousRef.current) {
      hasTrackedContinuousRef.current = true;
    }
  }, [isMergedMode, id]);

  useEffect(() => {
    if (!isMergedMode) return;
    if (!activeChapterId || !activeChapterNumber) return;

    if (lastActiveChapterRef.current && lastActiveChapterRef.current !== activeChapterId) {
      const previous = allChapters.find((ch) => ch.id === lastActiveChapterRef.current);
      if (previous) {
        // Mark the previous chapter as read when scrolling past it in merged mode
        if (user) {
          markChapterAsRead(Number(id), previous.id).catch((err) => {
            console.error('Failed to mark chapter as read:', err);
          });
        }
      }
    }

    lastActiveChapterRef.current = activeChapterId;
  }, [isMergedMode, activeChapterId, activeChapterNumber, allChapters, id, user]);

  useEffect(() => {
    if (isMergedMode) {
      scrollToMergedChapter(Number(chapterId));
    }
  }, [isMergedMode, scrollToMergedChapter, chapterId]);

  useEffect(() => {
    if (!id) return;
    if (wasMergedModeRef.current && !isMergedMode) {
      const targetChapterId = lastActiveChapterRef.current;
      if (targetChapterId && targetChapterId !== Number(chapterId)) {
        router.push(`/manga/${id}/read/${targetChapterId}`);
        window.scrollTo(0, 0);
      }
    }
    wasMergedModeRef.current = isMergedMode;
  }, [isMergedMode, id, chapterId, router]);

  // Load chapter data
  useEffect(() => {
    const loadMangaPages = async () => {
      if (!id || !chapterId) return;
      try {
        setLoading(true);
        setIsNavigating(false);
        // Reset scroll position flag for new chapter
        hasScrolledToPage.current = false;
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
        dismissContinuousModeToast(Number(id));
      }
      // Cleanup pending timeouts
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
      }
    };
  }, [id]);

  // Reading timer
  useEffect(() => {
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    lastSentRef.current = 0;
    if (!user || !id || !chapterId) return;

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const newValue = prev + 1;
        elapsedSecondsRef.current = newValue;
        return newValue;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // Send any remaining unsent time
      const unsent = elapsedSecondsRef.current - lastSentRef.current;
      if (unsent > 0) {
        sendReadingTime(unsent);
      }
    };
  }, [user, id, chapterId, sendReadingTime]);

  // Send reading time periodically
  useEffect(() => {
    if (!user || !id || !chapterId) return;
    if (elapsedSeconds > 0 && elapsedSeconds - lastSentRef.current >= 10) {
      sendReadingTime(elapsedSeconds - lastSentRef.current);
      lastSentRef.current = elapsedSeconds;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds]);

  // Auto-scroll functionality (vertical mode only)
  useEffect(() => {
    if (isHorizontalMode || settings.autoScroll === 'off') {
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
  }, [isHorizontalMode, settings.autoScroll]);

  // Pause auto-scroll on user interaction
  useEffect(() => {
    if (isHorizontalMode || settings.autoScroll === 'off') return;

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
  }, [isHorizontalMode, settings.autoScroll]);

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

      if (settings.stickyHeader) {
        mainNav.style.transform = 'translateY(0)';
        if (mobileHeader) mobileHeader.style.transform = 'translateY(0)';
      } else if (currentScrollY < 50) {
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
    if (settings.stickyHeader) {
      mainNav.style.transform = 'translateY(0)';
      const mobileHeader = mobileHeaderRef.current;
      if (mobileHeader) mobileHeader.style.transform = 'translateY(0)';
    }
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
  }, [sidebarCollapsed, settings.stickyHeader]);

  // Scroll to active chapter in desktop sidebar
  useEffect(() => {
    if (!loading && allChapters.length > 0) {
      const activeBtn = document.getElementById(`chapter-${chapterId}`);
      if (activeBtn) activeBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [loading, chapterId, allChapters]);

  // Scroll to active chapter in mobile sidebar when it opens
  useEffect(() => {
    if (!sidebarOpen || !chapterId || allChapters.length === 0) return;
    const scrollToActive = () => {
      const container = mobileChapterListRef.current;
      if (!container) return;
      const el = container.querySelector<HTMLElement>(`[data-chapter-id="${chapterId}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(scrollToActive);
    });
    return () => cancelAnimationFrame(t);
  }, [sidebarOpen, chapterId, allChapters.length]);

  // Strip page parameter from URL when in continuous mode
  useEffect(() => {
    if (!isMergedMode || !id || !chapterId) return;
    
    const pageParam = searchParams?.get('page');
    if (pageParam) {
      // Remove the page parameter from URL in continuous mode
      router.replace(`/manga/${id}/read/${chapterId}`, { scroll: false });
    }
  }, [isMergedMode, id, chapterId, searchParams, router]);

  // Scroll to page from URL param (only in normal mode)
  useEffect(() => {
    if (loading || isMergedMode || !data || !containerRef.current || hasScrolledToPage.current) return;

    const pageParam = searchParams?.get('page');
    if (pageParam) {
      const pageNumber = parseInt(pageParam, 10);
      if (!isNaN(pageNumber) && pageNumber > 0) {
        setTimeout(() => {
          scrollToImageIndex(pageNumber - 1);
        }, 300);
        hasScrolledToPage.current = true;
      }
    }
  }, [loading, data, searchParams, scrollToImageIndex, isMergedMode]);

  // Update progress tracking
  useEffect(() => {
    if (!user || !data || !id || !chapterId) return;
    if (currentPage === 0 || currentPage === lastTrackedPage) return;

    const currentItem = imageItems[currentPage - 1];
    if (!currentItem) return;

    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current);
    }

    progressTimeoutRef.current = setTimeout(async () => {
      try {
        await updateProgress({
          seriesId: Number(id),
          chapterId: currentItem.chapterId,
          pageNumber: currentItem.pageNumber,
          totalPagesInChapter: currentItem.totalPagesInChapter,
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
  }, [user, data, id, chapterId, currentPage, lastTrackedPage, imageItems]);

  // Track current page based on scroll position (vertical mode only)
  useEffect(() => {
    if (isHorizontalMode || !containerRef.current || imageItems.length === 0) return;

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
            const currentItem = imageItems[i];
            void currentItem;
          }
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [imageItems, currentPage, isHorizontalMode]);

  // Reset to first page when switching to horizontal mode
  useEffect(() => {
    if (isHorizontalMode && currentPage === 0 && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [isHorizontalMode, currentPage, totalPages]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (loading || isNavigating) return;

      if (event.key === 'Escape') {
        if (keybindsModalOpen) { setKeybindsModalOpen(false); return; }
        if (settingsModalOpen) { setSettingsModalOpen(false); return; }
        if (commentsSidebarOpen) { setCommentsSidebarOpen(false); return; }
        if (sidebarOpen) { setSidebarOpen(false); return; }
        return;
      }

      if (isHorizontalMode) {
        const isRtl = settings.readingDirection === 'rtl';
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          handleHorizontalPageNav(isRtl ? 'next' : 'prev');
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          handleHorizontalPageNav(isRtl ? 'prev' : 'next');
        } else if (event.key === 'ArrowUp') {
          if (!prevChapter) return;
          event.preventDefault();
          navigateToChapter(prevChapter);
        } else if (event.key === 'ArrowDown') {
          if (!nextChapter) return;
          event.preventDefault();
          navigateToChapter(nextChapter);
        }
        return;
      }

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
  }, [handlePageClick, handleHorizontalPageNav, loading, isNavigating, isHorizontalMode, settings.readingDirection, nextChapter, prevChapter, navigateToChapter, keybindsModalOpen, settingsModalOpen, commentsSidebarOpen, sidebarOpen]);

  if (loading) {
    return <div className="loading text-primary p-5 text-center">Loading Chapter...</div>;
  }

  // Render progress indicator based on position
  const renderProgressIndicator = () => {
    if (settings.progressIndicator === 'off' || totalPages === 0) return null;

    const percentage = ((currentPage / totalPages) * 100).toFixed(1);
    const label = `${currentPage}/${totalPages}`;

    if (settings.progressIndicator === 'right') {
      return (
        <div className="fixed top-0 h-screen w-2 bg-foreground/30 z-50 pointer-events-none transition-all duration-300 shadow-md" style={{ right: isDesktop && commentsSidebarOpen ? COMMENTS_SIDEBAR_WIDTH_PX : 0 }}>
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
        <div className="fixed top-0 left-0 right-0 h-1 bg-foreground/30 z-50 pointer-events-none shadow-md">
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
        <div className="fixed bottom-0 left-0 right-0 h-1 bg-foreground/30 z-50 pointer-events-none shadow-md">
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

  const renderSidebarControls = () => (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" onClick={() => router.push('/')} title="Back to Home" aria-label="Back to Home" className={SIDEBAR_BTN_HALF}>
          <Home size={18} />
        </button>
        <button type="button" onClick={() => router.push(`/manga/${id}`)} title="Back to Overview" aria-label="Back to Overview" className={SIDEBAR_BTN_HALF}>
          <BookOpen size={18} />
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => prevChapter && navigateToChapter(prevChapter)} disabled={!prevChapter || isNavigating} title="Previous Chapter" aria-label="Previous Chapter" className={SIDEBAR_BTN_HALF}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" onClick={() => nextChapter && navigateToChapter(nextChapter)} disabled={!nextChapter || isNavigating} title="Next Chapter" aria-label="Next Chapter" className={SIDEBAR_BTN_HALF}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setSettingsModalOpen(true)} title="Reader Settings" aria-label="Reader Settings" className={SIDEBAR_BTN_HALF}>
          <Settings size={18} />
        </button>
        <button type="button" onClick={() => void toggleFullscreen()} title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'} aria-label={isFullscreen ? 'Exit Full Screen' : 'Full Screen'} className={SIDEBAR_BTN_HALF}>
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>
      <button type="button" onClick={() => setCommentsSidebarOpen((open) => !open)} title="Comments" aria-label="Comments" className={SIDEBAR_BTN_FULL}>
        <MessageSquare size={18} />
      </button>
      <button type="button" onClick={() => setKeybindsModalOpen(true)} title="Keybinds" aria-label="Keybinds" className={SIDEBAR_BTN_FULL}>
        <Keyboard size={18} />
      </button>
    </div>
  );

  const mainLayoutClass = 'content w-full md:py-18.25 pt-24 md:pt-18.25 pb-20 md:pb-0 relative flex flex-col items-center transition-all duration-300';

  const tapZoneClass = 'click-zones fixed top-0 bottom-0 left-0 right-0 flex z-10 pointer-events-none pt-24 md:pt-0 transition-all duration-300';

  const mainLayoutStyle: React.CSSProperties | undefined = isDesktop ? {
    marginLeft: sidebarCollapsed ? 0 : SIDEBAR_WIDTH_PX,
    marginRight: commentsSidebarOpen ? COMMENTS_SIDEBAR_WIDTH_PX : 0,
    width: `calc(100% - ${(sidebarCollapsed ? 0 : SIDEBAR_WIDTH_PX) + (commentsSidebarOpen ? COMMENTS_SIDEBAR_WIDTH_PX : 0)}px)`,
  } : undefined;

  const tapZoneStyle: React.CSSProperties | undefined = isDesktop ? {
    left: sidebarCollapsed ? 0 : SIDEBAR_WIDTH_PX,
    right: commentsSidebarOpen ? COMMENTS_SIDEBAR_WIDTH_PX : 0,
  } : undefined;

  return (
    <div ref={readerRootRef} className="reader-root flex bg-background min-h-screen text-primary flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className={`sidebar hidden md:flex md:h-screen md:fixed md:left-0 md:top-0 md:bg-foreground shadow-md md:border-r md:border-r-borders md:flex-col md:z-100 md:transition-all md:duration-300 ${
        sidebarCollapsed ? 'md:w-0 md:overflow-hidden' : 'md:w-65'
      }`}>
        <div className="sidebar-header px-4 py-4 border-b border-borders">
          <h2 className="text-[1.25rem] font-bold mb-4 text-white">Chapter {activeChapterNumber}</h2>
          {renderSidebarControls()}
        </div>

        {/* Chapter List */}
        <div className="chapter-list-scroll flex-1 overflow-y-auto p-4">
          <div className="grid-list grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {allChapters.map((ch) => (
              <button key={ch.id} id={`chapter-${ch.id}`} onClick={() => navigateToChapter(ch)} disabled={isNavigating} className={`p-[10px_2px] text-[0.75rem] border cursor-pointer rounded-sm text-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                ch.id === activeChapterId ? 'font-bold bg-accent border-accent' : 'font-normal bg-background hover:bg-background/50 border-background'
              }`}>
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
          <aside className="sidebar fixed top-0 left-0 h-screen w-72 bg-foreground border-r border-r-borders shadow-md flex flex-col z-50 md:hidden">
            <div className="sidebar-header px-4 py-4 border-b border-borders flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="text-[1.25rem] font-bold text-white">Chapter {activeChapterNumber}</h2>
                <button onClick={() => setSidebarOpen(false)} className="text-primary hover:text-accent">
                  <X className="size-6" />
                </button>
              </div>
              {renderSidebarControls()}
            </div>
            <div ref={mobileChapterListRef} className="chapter-list-scroll flex-1 overflow-y-auto p-4">
              <div className="grid-list grid grid-cols-1 gap-2">
                {allChapters.map((ch) => (
                  <button key={ch.id} data-chapter-id={ch.id} onClick={() => {
                    navigateToChapter(ch);
                    setSidebarOpen(false);
                  }} disabled={isNavigating} className={`p-2 text-sm border cursor-pointer rounded text-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                    ch.id === activeChapterId ? 'font-bold bg-accent border-accent' : 'font-normal bg-background hover:bg-background/50 border-background'
                  }`}>
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
      <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="hidden md:flex md:fixed md:top-1/2 cursor-pointer md:-translate-y-1/2 md:bg-foreground md:hover:bg-background md:text-primary md:border md:border-borders md:rounded-full md:p-2 md:z-50 md:transition-all md:duration-300" style={{ left: sidebarCollapsed ? '8px' : `${SIDEBAR_WIDTH_PX + 8}px` }} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Comments Sidebar Collapse Button */}
      {commentsSidebarOpen && (
        <button onClick={() => setCommentsSidebarOpen(false)} className="hidden md:flex md:fixed md:top-1/2 cursor-pointer md:-translate-y-1/2 md:bg-foreground md:hover:bg-background md:text-primary md:border md:border-borders md:rounded-full md:p-2 md:z-[110] md:transition-all md:duration-300" style={{ right: `${COMMENTS_SIDEBAR_WIDTH_PX + 8}px` }} title="Collapse comments">
          <ChevronLeft size={18} />
        </button>
      )}

      {/* Mobile Header */}
      <div ref={mobileHeaderRef} className="md:hidden fixed top-16 left-0 right-0 bg-foreground/90 border-b border-borders px-4 py-3 z-40 flex items-center justify-between transition-transform duration-300">
        <button onClick={() => setSidebarOpen(true)} className="text-primary hover:text-accent p-2">
          <MenuIcon className="size-6" />
        </button>
        <span className="text-sm font-semibold">{currentPage}/{totalPages}</span>
        <div className="flex gap-2">
          <button onClick={() => setSettingsModalOpen(true)} className="text-primary hover:text-accent p-2">
            <Settings className="size-6" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className={mainLayoutClass} style={mainLayoutStyle}>
        {/* Tap Zones */}
        {settings.tapZones && (
          <div className={tapZoneClass} style={tapZoneStyle}>
            <div onClick={() => handleTapZoneClick('left')} className="prev-zone flex-1 pointer-events-auto cursor-w-resize" />
            <div onClick={() => handleTapZoneClick('center')} className="center-zone flex-1 pointer-events-auto cursor-pointer" />
            <div onClick={() => handleTapZoneClick('right')} className="next-zone flex-1 pointer-events-auto cursor-e-resize" />
          </div>
        )}

        {/* Horizontal Reader (LTR / RTL) */}
        {isHorizontalMode ? (
          <div className="horizontal-reader w-full min-h-[calc(100vh-8rem)] flex items-center justify-center z-5 px-4">
            {imageItems[currentPage - 1] && (
              <img
                src={imageItems[currentPage - 1].src}
                alt={`Page ${currentPage}`}
                className="max-h-[calc(100vh-10rem)] max-w-full object-contain manga-page"
                style={getImageStyle}
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
        ) : (
          /* Vertical Image Container */
          <div ref={containerRef} className="image-stack w-full max-w-212.5 z-5" style={containerStyles}>
            {imageItems.map((item, index) => (
              <LazyMangaPage
                key={`${item.chapterId}-${index}`}
                src={item.src}
                index={index}
                alt={`Page ${index + 1}`}
                className={getImageClassName}
                style={getImageStyle}
              />
            ))}
          </div>
        )}

        {/* Footer Navigation */}
        <div className="footer-nav py-10 text-center z-40 w-full max-w-212.5 px-4">
          {nextChapter || prevChapter ? (
            <div className="flex flex-wrap items-center justify-center gap-4">
              {prevChapter ? (
                <button onClick={() => navigateToChapter(prevChapter)} disabled={isNavigating} className="px-8 py-4 bg-foreground hover:bg-foreground/80 text-primary border border-borders rounded-md text-[1.1rem] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
                  ← Chapter {prevChapter.chapterNumber}
                </button>
              ) : (
                <div className="w-45 hidden sm:block" aria-hidden />
              )}
              {nextChapter ? (
                <button onClick={() => navigateToChapter(nextChapter)} disabled={isNavigating} className="px-12 py-4 bg-accent hover:bg-accent/80 text-white border-none rounded-md text-[1.1rem] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
                  Read Chapter {nextChapter.chapterNumber} →
                </button>
              ) : (
                <div className="flex flex-col py-2">
                  <span className="text-primary/70">You have reached the end of available chapters.</span>
                  <button className="mt-5 text-accent hover:underline cursor-pointer" onClick={() => router.push(`/manga/${id}`)}>Return to Manga Overview</button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col py-2">
              <span className="text-primary/70">You have reached the end of available chapters.</span>
              <button className="mt-5 text-accent hover:underline cursor-pointer" onClick={() => router.push(`/manga/${id}`)}>Return to Manga Overview</button>
            </div>
          )}
        </div>
      </main>

      {/* Desktop Comments Sidebar — anchored to viewport right edge */}
      <aside
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-auto md:top-0 md:bg-foreground md:border-l md:border-l-borders md:z-110 md:transition-all md:duration-300 md:overflow-hidden ${
          commentsSidebarOpen ? '' : 'md:pointer-events-none'
        }`}
        style={{ right: 0, width: commentsSidebarOpen ? COMMENTS_SIDEBAR_WIDTH_PX : 0 }}
      >
        <div className="px-4 py-4 border-b border-borders flex justify-between items-center shrink-0">
          <h2 className="text-[1.25rem] font-bold text-white">Comments</h2>
          <button onClick={() => setCommentsSidebarOpen(false)} className="text-primary hover:text-accent cursor-pointer" aria-label="Close comments">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {activeChapterId && id && commentsSidebarOpen && (
            <Comments key={activeChapterId} manga={{ id: Number(id) }} chapterId={activeChapterId} className="text-left" />
          )}
        </div>
      </aside>

      {/* Mobile Comments Drawer */}
      {commentsSidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setCommentsSidebarOpen(false)} />
          <aside className="fixed inset-0 z-50 flex flex-col bg-foreground overflow-hidden md:hidden pb-[env(safe-area-inset-bottom)]">
            <div className="px-4 py-3 border-b border-borders flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold text-white">Comments</h2>
              <button onClick={() => setCommentsSidebarOpen(false)} className="text-primary hover:text-accent p-1" aria-label="Close comments">
                <X className="size-6" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4">
              {activeChapterId && id && (
                <Comments key={activeChapterId} manga={{ id: Number(id) }} chapterId={activeChapterId} className="text-left min-w-0 max-w-full" />
              )}
            </div>
          </aside>
        </>
      )}

      {/* Modals */}
      <ReaderSettingsModal isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} onSettingsChange={handleSettingsChange} />
      <KeybindsModal isOpen={keybindsModalOpen} onClose={() => setKeybindsModalOpen(false)} readingDirection={settings.readingDirection} />
    </div>
  );
}
