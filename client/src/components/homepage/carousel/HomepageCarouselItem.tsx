import { HOMEPAGE_CAROUSEL_ITEM_CLASS } from "@/constants/homepage";
import type { ReactNode } from "react";

export default function HomepageCarouselItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className ?? HOMEPAGE_CAROUSEL_ITEM_CLASS}>
      <div className="flex h-full w-full min-h-0 flex-col">{children}</div>
    </div>
  );
}
