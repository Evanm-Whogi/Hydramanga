import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpen, Clock, Compass, Heart, List, MessageSquare, Shield, Smartphone, Trophy, Users } from "lucide-react";

const SITE_NAME = process.env.NEXT_PUBLIC_NAME ?? "HydraManga";
const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD ?? "https://discord.gg/A27sQQTWWe";

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-borders bg-foreground p-5 shadow-md">
      <div className="flex items-center justify-center rounded-full w-fit mx-auto">{icon}</div>
      <h3 className="text-lg font-semibold text-primary text-center">{title}</h3>
      <p className="text-sm leading-relaxed text-muted text-center">{description}</p>
    </div>
  );
}

function ResourceLink({ href, external, title, description }: { href: string; external?: boolean; title: string; description: string }) {
  const className = "group flex flex-col rounded-xl border border-borders bg-foreground p-5 shadow-md transition-colors hover:border-accent/40 hover:bg-foreground/90";
  const content = (
    <>
      <h3 className="text-base font-semibold text-primary">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
        Learn more
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

export default function AboutContent() {
  return (
    <div className="flex flex-col gap-10 pb-6 space-y-6">
      <section className="overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center gap-6 px-6 text-center md:px-10">
          <Image src="/logoIcon.png" width={246} height={246} alt="" className="shrink-0" priority />
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold uppercase tracking-widest text-accent">About us</p>
              <h2 className="mt-2 text-2xl font-bold text-primary md:text-3xl">A reader-first home for manga, manhwa, and manhua</h2>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-muted md:text-base">
              {SITE_NAME} is a community-driven platform where fans can discover, track, review, and discuss their favorite series in one place.
              Create lists, earn badges, climb the leaderboards, and connect with readers who never sleep.
            </p>
            <p className="max-w-3xl text-sm leading-relaxed text-muted md:text-base">
              This is a passion project, not a full-time job. We built it because we wanted a better way to read together, and we are committed to
              keeping the experience free of ads and paid features.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-primary">What you can do here</h2>
          <p className="mt-1 text-sm text-muted">Everything you need to find your next obsession and keep up with the ones you already love.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <FeatureCard icon={<Compass className="size-12 text-accent" />} title="Discover & explore" description="Browse a growing catalog of manga, manhwa, and manhua. Filter by genre, type, rating, and more, with an optional NSFW toggle in your settings." />
          <FeatureCard icon={<BookOpen className="size-12 text-accent" />} title="Read & track progress" description="Pick up where you left off with reading history, chapter progress, and customizable lists like Unread, Reading, Finished, and Dropped." />
          <FeatureCard icon={<List className="size-12 text-accent" />} title="Curate your library" description="Bookmark series, build public lists, and organize what you want to read next. Your profile shows off your taste and reading stats." />
          <FeatureCard icon={<MessageSquare className="size-12 text-accent" />} title="Review & discuss" description="Leave reviews, comment on chapters, post on the forum, and chat in real time with other readers. Spoiler tags and community guidelines keep things civil." />
          <FeatureCard icon={<Trophy className="size-12 text-accent" />} title="Earn karma & badges" description="Gain reputation through helpful reviews and community participation. Unlock badges for reading streaks, milestones, and discovery achievements." />
          <FeatureCard icon={<Users className="size-12 text-accent" />} title="Join the community" description="Compete on the leaderboard, follow other readers, share your profile card, and hang out on Discord for recommendations and site updates." />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-borders bg-foreground p-6 shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full border border-borders bg-background">
              <Clock className="size-5 text-accent" />
            </div>
            <h2 className="text-xl font-bold text-primary">How the catalog works</h2>
          </div>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted">
            <li>New chapters are checked and updated <span className="font-medium text-primary">twice daily at 7:00 AM and 7:00 PM PST</span>.</li>
            <li>
              Missing a series? Submit an import request on the{" "}
              <Link href="/request" className="text-accent underline hover:text-accent/80">Request</Link> page. Requests are reviewed manually and may take up to 24 hours.
            </li>
            <li><span className="font-medium text-primary">Metadata is aggregated from multiple sources to deliver the best information possible. Chapter's are downloaded, managed, and transcoded in house through a fully custom ingestion pipeline.</span></li>
          </ul>
        </div>

        <div className="rounded-xl border border-borders bg-foreground p-6 shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full border border-borders bg-background">
              <Heart className="size-5 text-accent" />
            </div>
            <h2 className="text-xl font-bold text-primary">Our promise</h2>
          </div>
          <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted">
            <li><span className="font-medium text-primary">No ads and no paid features</span> we currently have no plans to add either.</li>
            <li>Free accounts unlock bookmarks, reading lists, progress sync, reviews, karma, badges, and community participation.</li>
            <li>Your privacy matters. We collect only what we need to run the site, see our <Link href="/privacy" className="text-accent underline hover:text-accent/80">Privacy Policy</Link> for details.</li>
            <li>We expect everyone to follow our <Link href="/community-guidelines" className="text-accent underline hover:text-accent/80">Community Guidelines</Link> so {SITE_NAME} stays welcoming for all readers.</li>
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 size-5 shrink-0 text-amber-400" />
          <div>
            <h2 className="text-base font-semibold text-primary">Copyright & DMCA</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              We respect intellectual property rights. If you believe content on {SITE_NAME} infringes your copyright, submit a notice through our{" "}
              <Link href="/contact" className="text-accent underline hover:text-accent/80">Contact & DMCA</Link> page and our team will review it.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-primary">Helpful links</h2>
          <p className="mt-1 text-sm text-muted">Quick access to the pages most readers need.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <ResourceLink href="/request" title="Request a series" description="Ask us to add manga that is not in the catalog yet." />
          <ResourceLink href="/pwa" title="Install the app" description={`Add ${SITE_NAME} to your home screen for a faster, app-like reading experience.`} />
          <ResourceLink href={DISCORD_URL} external title="Join Discord" description="Chat with the community, get help, and stay up to date on releases." />
          <ResourceLink href="/community-guidelines" title="Community guidelines" description="Rules for chat, reviews, the forum, and public profiles." />
          <ResourceLink href="/contact" title="Contact & DMCA" description="Reach out for support, feedback, or copyright concerns." />
          <ResourceLink href="/privacy" title="Privacy policy" description="How we collect, use, and protect your information." />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-borders bg-foreground shadow-md">
        <div className="flex flex-col items-center gap-4 px-6 py-8 text-center md:flex-row md:justify-between md:px-10 md:text-left">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full border border-borders bg-background shadow-sm">
              <Smartphone className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary text-left">Ready to start reading?</h2>
              <p className="mt-1 text-sm text-muted">Create a free account or jump straight into the catalog.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90">
              Create account
            </Link>
            <Link href="/discover" className="inline-flex items-center gap-1.5 rounded-lg border border-borders bg-background px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-foreground/60">
              Browse catalog
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
