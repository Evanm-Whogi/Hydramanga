'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { User, X } from 'lucide-react';
import { dismissWelcomeModal } from '@/lib/welcomeModal';
import MarkdownView from '@/components/markdown/MarkdownView';
import { DEFAULT_WELCOME_MODAL_BODY, DEFAULT_WELCOME_MODAL_DESCRIPTION, DEFAULT_WELCOME_MODAL_TITLE } from '@/lib/defaultWelcomeModal';

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD ?? 'https://discord.gg/A27sQQTWWe';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | null;
  description?: string | null;
  bodyMarkdown?: string | null;
  registrationEnabled?: boolean;
}

export function WelcomeModal({ isOpen, onClose, title, description, bodyMarkdown, registrationEnabled = true }: WelcomeModalProps) {
  const displayTitle = title?.trim() || DEFAULT_WELCOME_MODAL_TITLE;
  const displayDescription = description?.trim() || DEFAULT_WELCOME_MODAL_DESCRIPTION;
  const displayBody = bodyMarkdown?.trim() || DEFAULT_WELCOME_MODAL_BODY;

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
      <div role="dialog" aria-modal="true" 
      aria-labelledby="welcome-modal-title" 
      className="relative z-10 bg-foreground border border-borders rounded-xl shadow-2xl w-[90%] max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-xl 2xl:max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
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
            alt="Site logo"
            className="mx-auto"
            priority
          />

          <div className="space-y-2">
            <h2 id="welcome-modal-title" className="text-2xl font-bold text-primary">
              {displayTitle}
            </h2>
            <p className="text-muted text-sm">
              {displayDescription}
            </p>
          </div>

          <div className="w-full rounded-lg bg-background p-4 text-left text-sm text-muted leading-relaxed my-3">
            <MarkdownView content={displayBody} />
          </div>

          {registrationEnabled && (
            <Link
              href="/register"
              onClick={handleDismiss}
              className="w-full px-5 py-2.5 text-lg font-medium bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors inline-flex items-center justify-center gap-1"
            >
              <User size={20}/>Create an account
            </Link>
          )}

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
