'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { User, X } from 'lucide-react';
import { dismissWelcomeModal } from '@/lib/welcomeModal';

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD ?? 'https://discord.gg/A27sQQTWWe';
const SITE_NAME = process.env.NEXT_PUBLIC_NAME ?? 'Manga Scrolls';
const SITE_DESC = process.env.NEXT_PUBLIC_DESC ?? 'Your ultimate destination for manga. Discover, read, and share thousands of titles from your favorite genres.';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  useEffect(() => {
    const root = document.documentElement;
    if (isOpen) {
      root.classList.add('lock-scroll');
    } else {
      root.classList.remove('lock-scroll');
    }
    return () => root.classList.remove('lock-scroll');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleDismiss = () => {
    dismissWelcomeModal();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={handleDismiss} aria-hidden/>
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-modal-title" className="relative z-10 bg-foreground border border-borders rounded-xl shadow-2xl w-[90%] md:w-1/4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-muted hover:text-primary transition-colors hover:bg-background rounded-full p-1 cursor-pointer"
          aria-label="Close welcome modal"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center px-6 pt-10 pb-8 space-y-5">
          <Image
            src="/logoIcon.png"
            width={120}
            height={120}
            alt={`${SITE_NAME} logo`}
            className="mx-auto"
            priority
          />

          <div className="space-y-2">
            <h2 id="welcome-modal-title" className="text-2xl font-bold text-primary">
              Welcome to {SITE_NAME}
            </h2>
            <p className="text-muted text-sm">
              {SITE_DESC}
            </p>
          </div>

          <div className="w-full rounded-lg bg-background p-4 text-left text-sm text-muted leading-relaxed my-3">
            <p>A little bit of information before you get started: </p>
            <ul className="list-disc list-inside">
              <li className="font-bold">We currently have no plans to add any ads or paid features.</li>
              <li>You can create an account to save your favorite manga, read lists, and more.</li>
              <li>Manga chapters are updated twice daily at 7:00 AM and 7:00 PM PST.</li>
              <li>You can request new manga to be added to the site by clicking <Link href="/request" className="text-accent hover:underline">here</Link>.</li>
              <li>Every file is downloaded, managed, and transcoded in house.</li>
              <li>No manga chapters are hotlinked from external sources. </li>
              <li>Import requests are processed manually and may take up to 24 hours</li>
              <li>This is a passion project of mine and is not a full time job. I do this in my free time.</li>
            </ul>
          </div>

          <Link
            href="/register"
            onClick={handleDismiss}
            className="w-full px-5 py-2.5 text-lg font-medium bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors inline-flex items-center justify-center gap-1"
          >
           <User size={20}/>Create an account
          </Link>

          <div className="w-full space-y-1 pt-1 mt-5">
            <p className="text-lg font-semibold text-primary text-left">Join our Discord</p>
            <p className="text-sm text-muted text-left">
              Connect with other readers, share recommendations, get help, and stay in the loop on site updates and new releases.
            </p>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDismiss}
              className="inline-flex w-full items-center justify-center gap-1 px-5 mt-3 py-1.5 text-lg font-medium bg-background hover:bg-background/80 text-primary border border-borders rounded-lg transition-colors"
            >
              <img src="/oauthIcons/discord.webp" alt="" className="size-9" aria-hidden />
              Join our Discord
            </a>
            <span className="text-sm text-muted text-center">Once you dismiss this message, you will not see it again for 24 hours.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
