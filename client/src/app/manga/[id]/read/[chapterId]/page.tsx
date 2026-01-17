"use client";
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from "next/navigation";
import { fetchMangaPages } from '@/services/mangaService';

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

const ReadPage = () => {
  const { id, chapterId } = useParams();
  const router = useRouter();
  const [data, setData] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);
  // Use a Ref for scroll tracking to prevent stale closures/missing hide triggers
  const lastScrollPos = useRef(0);

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

  // Updated Navbar Hide Logic using Refs
  useEffect(() => {
    const mainNav = document.querySelector('nav') || document.querySelector('header');
    if (!mainNav) return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // If we are near the top, show the nav
      if (currentScrollY < 50) {
        mainNav.style.transform = 'translateY(0)';
      } 
      // If scrolling down, hide it
      else if (currentScrollY > lastScrollPos.current) {
        mainNav.style.transform = 'translateY(-100%)';
        mainNav.style.transition = 'transform 0.3s ease-in-out';
      } 
      // If scrolling up, show it
      else {
        mainNav.style.transform = 'translateY(0)';
      }

      lastScrollPos.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (mainNav) mainNav.style.transform = 'translateY(0)';
    };
  }, []); // Empty dependency array because we use a Ref

  useEffect(() => {
    if (!loading && allChapters.length > 0) {
      const activeBtn = document.getElementById(`chapter-${chapterId}`);
      if (activeBtn) activeBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [loading, chapterId, allChapters]);

  const handlePageClick = (direction: 'next' | 'prev') => {
    if (!containerRef.current) return;
    const images = Array.from(containerRef.current.querySelectorAll('img'));
    const viewportMiddle = window.scrollY + (window.innerHeight / 2);

    if (direction === 'next') {
      const nextImg = images.find(img => {
        const imgAbsoluteMiddle = img.getBoundingClientRect().top + window.scrollY + (img.offsetHeight / 2);
        return imgAbsoluteMiddle > viewportMiddle + 20; 
      });
      if (nextImg) {
        const imgAbsoluteMiddle = nextImg.getBoundingClientRect().top + window.scrollY + (nextImg.offsetHeight / 2);
        window.scrollTo({ top: imgAbsoluteMiddle - (window.innerHeight / 2), behavior: 'smooth' });
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    } else {
      const prevImg = [...images].reverse().find(img => {
        const imgAbsoluteMiddle = img.getBoundingClientRect().top + window.scrollY + (img.offsetHeight / 2);
        return imgAbsoluteMiddle < viewportMiddle - 20;
      });
      if (prevImg) {
        const imgAbsoluteMiddle = prevImg.getBoundingClientRect().top + window.scrollY + (prevImg.offsetHeight / 2);
        window.scrollTo({ top: imgAbsoluteMiddle - (window.innerHeight / 2), behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  if (loading) return <div className="loading text-primary p-5 text-center">Loading Chapter...</div>;

  const currentIndex = allChapters.findIndex(ch => ch.id === Number(chapterId));
  const prevChapter = allChapters[currentIndex - 1];
  const nextChapter = allChapters[currentIndex + 1];

  return (
    <div className="reader-root flex bg-background min-h-screen text-primary">
      
      <aside className="sidebar w-65 h-screen fixed left-0 top-0 bg-foreground border-r border-r-borders flex flex-col z-100">
        <div className="sidebar-header px-6 py-4 border-b-borders">
          <h2 className="text-[1.25rem] font-bold mb-4 text-white">Chapter {data?.chapterNumber}</h2>
          <div className="flex gap-2">
            <button onClick={() => { if(prevChapter) { router.push(`/manga/${id}/read/${prevChapter.id}`); window.scrollTo(0,0); } }} disabled={!prevChapter} className="flex-1 p-2.5 bg-background border-0 text-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 rounded">Prev</button>
            <button onClick={() => { if(nextChapter) { router.push(`/manga/${id}/read/${nextChapter.id}`); window.scrollTo(0,0); } }} disabled={!nextChapter} className="flex-1 p-2.5 bg-background border-0 text-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 rounded">Next</button>
          </div>
        </div>
        <div className="chapter-list-scroll flex-1 overflow-y-auto p-4">
          <div className="grid-list grid grid-cols-3 gap-1.5">
            {allChapters.map((ch) => (
              <button key={ch.id} id={`chapter-${ch.id}`} onClick={() => { router.push(`/manga/${id}/read/${ch.id}`); window.scrollTo(0,0); }} className={`p-[10px_2px] text-[0.75rem] border cursor-pointer rounded-sm text-primary ${ch.id === Number(chapterId) ? 'font-bold bg-accent border-accent' : 'font-normal bg-background border-background'}`}>
                {ch.chapterNumber}
              </button>
            ))}
          </div>
        </div>
      </aside>

  <main className="content py-18.25 ml-65 w-[calc(100%-260px)] relative flex flex-col items-center">
    <div className="click-zones fixed top-0 right-0 bottom-0 left-65 flex z-10 pointer-events-none">
      <div 
        onClick={() => handlePageClick('prev')} 
        className="prev-zone flex-1 pointer-events-auto cursor-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2232%22%20height%3D%2232%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%2215%2018%209%2012%2015%206%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E'),pointer]" />
      <div 
        onClick={() => handlePageClick('next')} 
        className="next-zone flex-1 pointer-events-auto cursor-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2232%22%20height%3D%2232%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%229%2018%2015%2012%209%206%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E'),pointer]" />
    </div>

    <div ref={containerRef} className="image-stack w-full max-w-212.5 bg-black z-5">
      {data?.images?.map((src, index) => (
        <img key={index} src={src} alt={`Page ${index + 1}`} className="manga-page w-full h-auto block" loading={index < 3 ? "eager" : "lazy"}/>
      ))}
    </div>

    <div className="footer-nav py-20 text-center z-100">
      {nextChapter && (
        <button onClick={() => { router.push(`/manga/${id}/read/${nextChapter.id}`); window.scrollTo(0,0); }} className="px-12 py-4 bg-[#3b82f6] text-white border-none rounded-md text-[1.1rem] font-bold cursor-pointer">
          Read Chapter {nextChapter.chapterNumber} →
        </button>
      )}
    </div>
  </main>
    </div>
  );
};

export default ReadPage;