import Link from "next/link";
import { Compass, SearchX, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background text-primary">
            <div className="container mx-auto px-4">
                <div className="max-w-2xl mx-auto text-center">
                    <div className="mb-8 flex justify-center">
                        <div className="relative">
                            <SearchX className="size-32 text-accent animate-pulse" />
                            <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full" />
                        </div>
                    </div>

                    <h1 className="text-6xl font-bold mb-3">404</h1>
                    <h2 className="text-3xl font-bold mb-4">Page Not Found</h2>
                    <p className="text-lg text-muted mb-8">
                        We couldn't find the page you're looking for. It might have been moved, deleted, or never existed.
                    </p>

                    <div className="bg-foreground rounded-lg p-6 mb-8 text-left shadow-lg">
                        <h3 className="text-lg font-semibold mb-3">What you can do:</h3>
                        <ul className="text-muted space-y-2">
                            <li className="flex items-start gap-2">
                                <span className="text-accent">•</span>
                                <span>Check the URL for typos or missing characters</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-accent">•</span>
                                <span>Use search to find the manga you want</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-accent">•</span>
                                <span>Head back to the homepage and browse collections</span>
                            </li>
                        </ul>
                    </div>

                    <div className="flex flex-wrap gap-4 justify-center">
                        <Link
                            href="/"
                            className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors font-semibold"
                        >
                            <Home className="size-5" />
                            Go Home
                        </Link>
                        <Link
                            href="/discover"
                            className="flex items-center gap-2 px-6 py-3 bg-foreground text-primary rounded-lg hover:bg-foreground/70 transition-colors font-semibold"
                        >
                            <Compass className="size-5" />
                            Browse Manga
                        </Link>
                        <Link
                            href="/discover"
                            className="flex items-center gap-2 px-6 py-3 bg-foreground text-primary rounded-lg hover:bg-foreground/70 transition-colors font-semibold"
                        >
                            <ArrowLeft className="size-5" />
                            Back to Search
                        </Link>
                    </div>

                    <p className="text-sm text-muted mt-8">Error Code: PAGE_NOT_FOUND</p>
                </div>
            </div>
        </div>
    );
}