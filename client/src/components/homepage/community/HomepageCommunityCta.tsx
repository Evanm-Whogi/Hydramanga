"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, LogIn, Smartphone, UserPlus } from "lucide-react";
import { useUser } from "@/providers/UserProvider";

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD ?? "https://discord.gg/A27sQQTWWe";

function CtaAction({ href, external, icon, title, description, actionLabel }: {
  href: string;
  external?: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
}) {
  const className =
    "group flex flex-1 flex-col items-center rounded-xl px-4 py-5 text-center transition-colors hover:bg-background/60 sm:px-6 sm:py-6";
  const content = (
    <>
      <div className="flex size-12 items-center justify-center rounded-full border border-borders bg-background shadow-sm transition-transform group-hover:scale-105">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-primary sm:text-base">{title}</h3>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted sm:text-sm">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent sm:text-sm">
        {actionLabel}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function AuthCtaColumn({ isLoggedIn }: { isLoggedIn: boolean }) {
  if (isLoggedIn) {
    return (
      <CtaAction
        href="/users/me"
        icon={<UserPlus className="size-5 text-accent" />}
        title="Your profile"
        description="Pick up where you left off and manage your lists."
        actionLabel="Open profile"
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center rounded-xl px-4 py-5 text-center sm:px-6 sm:py-6">
      <div className="flex size-12 items-center justify-center rounded-full border border-borders bg-background shadow-sm">
        <UserPlus className="size-5 text-accent" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-primary sm:text-base">Create an account</h3>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted sm:text-sm">Bookmark series, sync progress, and join the discussion.</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link href="/register" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent/90 sm:text-sm">
          <UserPlus className="size-3.5" />
          Sign up
        </Link>
        <Link href="/login" className="inline-flex items-center gap-1.5 rounded-lg border border-borders bg-background px-3.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-foreground/60 sm:text-sm">
          <LogIn className="size-3.5" />
          Log in
        </Link>
      </div>
    </div>
  );
}

export default function HomepageCommunityCta() {
  const { user } = useUser();

  return (
    <section aria-label="Join the community" className="overflow-hidden rounded-2xl border border-borders bg-foreground shadow-md w-full md:w-2/3 mx-auto">
      <div className="relative border-b border-borders px-6 py-8 text-center md:px-10 md:py-9">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Community</p>
        <h2 className="mt-2 text-xl font-bold text-primary md:text-2xl">Read together, anywhere</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted md:text-base">
          Join readers on Discord, save your place with a free account, or install the app for a smoother experience on mobile.
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-borders sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <AuthCtaColumn isLoggedIn={Boolean(user)} />
        <CtaAction
          href={DISCORD_URL}
          external
          icon={<img src="/oauthIcons/discord.webp" alt="" className="size-6" aria-hidden />}
          title="Join Discord"
          description="Chat with the community and get the latest updates."
          actionLabel="Open Discord"
        />
        <CtaAction
          href="/pwa"
          icon={<Smartphone className="size-5 text-primary" />}
          title="Install the app"
          description="Add Manga Scrolls to your home screen on iOS and Android."
          actionLabel="View install guide"
        />
      </div>
    </section>
  );
}
