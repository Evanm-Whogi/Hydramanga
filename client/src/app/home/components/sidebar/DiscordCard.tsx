"use client";

import Link from "next/link";
import Image from "next/image";
const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD ?? "https://discord.gg/A27sQQTWWe";

export default function PwaInstallCard() {
  return (
    <Link href={DISCORD_URL}>
    <div className="rounded-lg border border-borders bg-foreground p-4 hover:bg-foreground/50 transition-colors">
      <div className="flex gap-3 items-center">
        <img src="/oauthIcons/discord.webp" alt="" className="size-10 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-primary">Join Discord Community</h3>
          <p className="text-xs leading-relaxed text-muted">Become a part of our community.</p>
        </div>
      </div>
    </div>
    </Link>
  );
}
