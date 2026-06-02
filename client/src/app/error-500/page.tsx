"use client";
import { ServerCrash, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export default function Error500Page() {
    const [isChecking, setIsChecking] = useState(true);
    const [attempts, setAttempts] = useState(0);

    useEffect(() => {
        const checkHeartbeat = async () => {
            setAttempts(prev => prev + 1);
            
            try {
                const response = await fetch('/api/heartbeat', {
                    method: 'GET',
                    cache: 'no-store',
                });

                if (response.ok) {
                    console.log('Server is back online, redirecting...');
                    setIsChecking(false);
                    window.location.href = "/";
                }
            } catch (error) {
                console.log('Server still down, attempt:', attempts);
            }
        };

        // Check immediately
        checkHeartbeat();

        // Then poll every 3 seconds
        const interval = setInterval(checkHeartbeat, 3000);

        return () => clearInterval(interval);
    }, []);

    return (
        <html lang="en" className="theme-dark">
            <body className="bg-background text-primary min-h-screen flex flex-col">
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="container mx-auto px-4">
                        <div className="max-w-2xl mx-auto text-center">
                            <div className="mb-8 flex justify-center">
                                <div className="relative">
                                    <ServerCrash className="size-32 text-red-500 animate-pulse" />
                                    <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full"></div>
                                </div>
                            </div>

                            <h1 className="text-6xl font-bold text-primary mb-4">500</h1>
                            <h2 className="text-3xl font-bold text-primary mb-4">Server Error</h2>
                            
                            <p className="text-xl text-muted mb-4">
                                We're experiencing technical difficulties. Our server is currently unreachable or experiencing issues.
                            </p>

                            {/* Connection Status */}
                            <div className="flex items-center justify-center gap-2 mb-8">
                                <div className="flex items-center gap-2 px-4 py-2 bg-foreground rounded-full">
                                    {isChecking ? (
                                        <>
                                            <Wifi className="size-5 text-blue-400 animate-pulse" />
                                            <span className="text-sm font-semibold">Checking connection...</span>
                                            <span className="text-xs text-muted">({attempts} attempts)</span>
                                        </>
                                    ) : (
                                        <>
                                            <WifiOff className="size-5 text-red-400" />
                                            <span className="text-sm font-semibold">Server offline</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="bg-foreground rounded-lg p-6 mb-8">
                                <h3 className="text-lg font-semibold text-primary mb-3">What you can do:</h3>
                                <ul className="text-left text-muted space-y-2">
                                    <li className="flex items-start">
                                        <span className="text-accent mr-2">•</span>
                                        <span>We're automatically checking the connection - you'll be redirected when the server is back</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="text-accent mr-2">•</span>
                                        <span>Check your internet connection</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="text-accent mr-2">•</span>
                                        <span>Try manually refreshing if the auto-reconnect doesn't work</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="flex gap-4 justify-center">
                                <a
                                    href="/"
                                    className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors font-semibold"
                                >
                                    <RefreshCw className="size-5" />
                                    Retry Now
                                </a>
                            </div>

                            <p className="text-sm text-muted mt-8">
                                Error Code: CONNECTION_FAILED
                            </p>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
