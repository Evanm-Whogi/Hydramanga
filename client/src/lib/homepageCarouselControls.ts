export const homepageCarouselControlBaseClass =
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-borders text-xs font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export const homepageCarouselNavButtonClass = `${homepageCarouselControlBaseClass} size-9 bg-foreground text-primary hover:bg-accent hover:text-white`;

export function homepageCarouselFilterButtonClass(active: boolean): string {
  return `${homepageCarouselControlBaseClass} h-9 min-h-9 px-3 ${active ? "bg-accent text-white hover:bg-accent" : "bg-foreground text-primary hover:bg-accent hover:text-white"}`;
}
