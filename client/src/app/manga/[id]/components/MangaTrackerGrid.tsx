import { buildMangaTrackerLinks, type MangaSourceMap } from '@/lib/mangaTrackerLinks';

type MangaTrackerGridProps = {
  mangaId: number | string;
  source: MangaSourceMap | null | undefined;
  title: string;
};

function TrackerIcon({ label, icon, href }: { label: string; icon: string; href: string | null }) {
  const className = 'flex items-center justify-center rounded-lg bg-background p-2 shadow-sm transition-opacity hover:opacity-80';
  const image = <img src={icon} alt="" className="size-7 object-contain" aria-hidden />;

  if (!href) {
    return (
      <span title={`${label} — not linked`} className={`${className} opacity-35 cursor-not-allowed`} aria-disabled="true">
        {image}
        <span className="sr-only">{label} not linked</span>
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={label} className={className}>
      {image}
      <span className="sr-only">{label}</span>
    </a>
  );
}

export default function MangaTrackerGrid({ mangaId, source, title }: MangaTrackerGridProps) {
  const trackers = buildMangaTrackerLinks(mangaId, source, title);

  return (
    <div className="grid grid-cols-4 gap-2 pt-1">
      {trackers.map((tracker) => (
        <TrackerIcon key={tracker.key} label={tracker.label} icon={tracker.icon} href={tracker.href} />
      ))}
    </div>
  );
}
