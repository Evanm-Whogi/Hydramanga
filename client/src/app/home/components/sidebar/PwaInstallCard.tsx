"use client";

import Link from "next/link";
import { Smartphone } from "lucide-react";

export default function PwaInstallCard() {
  return (
    <Link href="/pwa">
    <div className="rounded-lg border border-borders bg-foreground p-4 hover:bg-foreground/50 transition-colors">
      <div className="flex gap-3 items-center">
        <div className="flex size-10 shrink-0 items-center justify-center bg-background rounded-full">
          <Smartphone className="size-5 text-white" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-primary">Install the app</h3>
          <p className="text-xs leading-relaxed text-muted">Install App for IOS & Android</p>
        </div>
      </div>
    </div>
    </Link>
  );
}
