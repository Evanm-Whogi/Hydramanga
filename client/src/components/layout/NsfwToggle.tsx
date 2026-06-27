'use client';
import { Eye, EyeOff } from 'lucide-react';
import { useNsfw } from '@/providers/NsfwProvider';
import NavIconTooltip from '@/components/layout/NavIconTooltip';

/**
 * Navbar control toggling whether 18+ (NSFW) content is shown.
 * Round icon button (matching the search button): an eye when adult content is
 * visible (accent), an eye-off when it's hidden (muted).
 */
export default function NsfwToggle({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { hideNsfw, toggle } = useNsfw();
  const showAdult = !hideNsfw;
  const Icon = showAdult ? Eye : EyeOff;
  const title = showAdult ? '18+ content visible' : '18+ content hidden';

  if (variant === 'mobile') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={showAdult}
        aria-label="Toggle 18+ content"
        className={`flex items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm hover:bg-foreground/70 text-left ${showAdult ? 'text-accent' : 'text-muted'}`}
      >
        <Icon className="size-4 shrink-0" />
        {showAdult ? '18+ Visible' : '18+ Hidden'}
      </button>
    );
  }

  return (
    <NavIconTooltip label={title}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={showAdult}
        aria-label="Toggle 18+ content"
        className={`p-3 rounded-full transition-colors cursor-pointer ${showAdult ? 'bg-accent text-white hover:bg-accent/80' : 'bg-background text-muted hover:bg-background/50'}`}
      >
        <Icon className="size-5" />
      </button>
    </NavIconTooltip>
  );
}
