import Link from 'next/link';
const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD ?? "https://discord.gg/A27sQQTWWe";

export default  function Footer() {
   return (
        <footer className="border-t-2 border-borders z-40 bg-background">
            <div className="container mx-auto">
                <div className="flex flex-col md:flex-row place-content-between pt-24 pb-12 space-y-6 md:space-y-0">
                    {/* About */}
                    <div className="flex flex-col w-full md:w-1/4 space-y-4 text-muted">
                        <h1 className="text-3xl text-primary">{process.env.NEXT_PUBLIC_NAME}</h1>
                        <p>{process.env.NEXT_PUBLIC_DESC}</p>
                    </div>
                    {/* Quick Links */}
                    <div className="flex flex-col w-full md:w-1/6 space-y-4 text-muted">
                        <h1 className="text-2xl text-primary">Quick Links</h1>
                        <Link href="/" className="hover:text-primary">Home</Link>
                        <Link href="/discover" className="hover:text-primary">Discover</Link>
                        <Link href="/lists" className="hover:text-primary">My Lists</Link>
                        <Link href="/users/me" className="hover:text-primary">My Profile</Link>
                        <Link href="/announcements" className="hover:text-primary">Announcements</Link>
                    </div>
                    {/* Reading */}
                    <div className="flex flex-col w-full md:w-1/6 space-y-4 text-muted">
                        <h1 className="text-2xl text-primary">Reading</h1>
                        <Link href="/discover?type=manga" className="hover:text-primary">Trending Manga</Link>
                        <Link href="/discover?type=manhua" className="hover:text-primary">Trending Manhua</Link>
                        <Link href="/discover?type=manhwa" className="hover:text-primary">Trending Manhwa</Link>
                        <Link href="/discover?years=2025&sort=lastUpdatedAt" className="hover:text-primary">New Releases</Link>
                        <Link href="/request" className="hover:text-primary">Request Manga</Link>
                    </div>
                    {/* Community */}
                    <div className="flex flex-col w-full md:w-1/6 space-y-4 text-muted">
                        <h1 className="text-2xl text-primary">Community</h1>
                        <Link href="/leaderboard" className="hover:text-primary">Leaderboard</Link>
                        <Link href="/board" className="hover:text-primary">Board</Link>
                        <Link href="/chat" className="hover:text-primary">Chat</Link>
                        <a href={DISCORD_URL} className="hover:text-primary">Join our Discord</a>
                    </div>
                    {/* Information Links */}
                    <div className="flex flex-col w-full md:w-1/6 space-y-4 text-muted">
                        <h1 className="text-2xl text-primary">Information</h1>
                        <Link href="/community-guidelines" className="hover:text-primary">Community Guidelines</Link>
                        <Link href="/contact" className="hover:text-primary">Contact/DMCA Notice</Link>
                        <Link href="/privacy" className="hover:text-primary">Privacy Policy</Link>
                        <Link href="/pwa" className="hover:text-primary">Progressive Web App</Link>
                    </div>
                </div>
                <div className="flex flex-col text-primary">
                    <hr className="border border-borders w-full" />
                    <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 py-5 items-center justify-between w-full text-sm">
                        <span className="">© 2026 {process.env.NEXT_PUBLIC_NAME}, LLC. All rights reserved.</span>
                        <span className="flex flex-col md:flex-row gap-2">Site Version: B-1.00</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}