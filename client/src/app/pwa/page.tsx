import PageHeader from "@/components/PageHeader";
import Link from "next/link";

export default function PWA() {
    return (
        <> 
            <PageHeader title="Progressive Web App" description="Learn how to install our PWA." />

            <div className="container mx-auto py-12">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold pb-2">Overview</h1>
                    <p>A Progressive Web App (PWA) is a lightweight version of {process.env.NEXT_PUBLIC_NAME} that you can install directly on your device like a normal app. It loads faster, runs smoother, and lets you access your favorite manga with a single tap. The {process.env.NEXT_PUBLIC_NAME} PWA works across many devices and operating systems, including iPhone, iPad, Android phones and tablets, Windows, macOS, and Linux, giving you a clean, app-like reading experience anywhere.</p>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex flex-col gap-2 pt-5 w-full md:w-1/2">
                                <div className="flex flex-col bg-foreground rounded-md p-4 shadow-md">
                                    <h2 className="text-2xl font-bold">IOS</h2>
                                    <p className="text-muted">Open the site in your browser, tap the share icon, and select “Add to Home Screen.” This works on Safari and most other iOS browsers, letting you access {process.env.NEXT_PUBLIC_NAME} like a regular app.</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 pt-5 w-full md:w-1/2">
                                <div className="flex flex-col bg-foreground rounded-md p-4 shadow-md">
                                    <h2 className="text-2xl font-bold">Android</h2>
                                    <p className="text-muted">Open the site in your browser, tap the share icon, and select “Add to Home Screen.” This works on Safari and most other iOS browsers, letting you access {process.env.NEXT_PUBLIC_NAME} like a regular app.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}