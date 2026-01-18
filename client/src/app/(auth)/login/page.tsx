"use client";
import Image from "next/image";
import InputField from '@/components/InputField';
import MasonryGrid from "@/components/MasonryGrid";
import { useState } from "react";
import { signIn } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const authHandler = async (type: "email" | "google" | "discord") => {
        setLoading(true);
        
        const result = type === "email" 
            ? await signIn.email({ email, password})
            : await signIn.social({ provider: type, callbackURL: "http://localhost:3000/home" });

        if (result.error) {
            toast(result.error.message || "Authentication failed", { type: 'error' });
            setLoading(false);
            return;
        }

        router.push("/home");
        router.refresh();
        toast(`Welcome Back!`, { type: 'success' });
    };

    return (
        <section id="header" className="py-45">
            <div className="container mx-auto">
                <div className="flex flex-row">
                    <div className="hidden md:block w-3/4 -z-50"><MasonryGrid /></div>
                    <div className="flex flex-col w-full md:w-1/4 p-5 space-y-2">
                        <Image src="/logo.png" width="192" height="192" alt="Login Logo" className="mx-auto"/>
                        <h1 className="text-4xl font-bold text-center">{process.env.NEXT_PUBLIC_NAME}</h1>
                        <h2 className="text-muted text-center">Your one stop spot for endless Manga.</h2>
                        <div className="flex flex-col space-y-3 mt-5 w-full">
                            <InputField label="Email address" placeholder="Email" value={email} onChange={(e: any) => setEmail(e.target.value)} />
                            <InputField label="Your Password" placeholder="Password" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} />
                        </div>
                        <button onClick={() => authHandler("email")} disabled={loading} className="p-3 mt-5 bg-foreground text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg">{loading ? "Logging in..." : "Login"}</button>
                        <div className="relative mt-5">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-foreground" /></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or continue with</span></div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => authHandler("google")} disabled={loading} className="p-3 mt-5 bg-foreground text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg w-1/2 inline-flex items-center justify-center">
                                <Image src="/oauthIcons/googleLogo.png" alt="google" width="64" height="64" className="size-6 mr-3" /> Google
                            </button>
                            <button onClick={() => authHandler("discord")} disabled={loading} className="p-3 mt-5 bg-foreground text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg w-1/2 inline-flex items-center justify-center">
                                <Image src="/oauthIcons/discordLogo.png" alt="discord" width="64" height="64" className="size-8 mr-3" /> Discord
                            </button>
                        </div>
                        <span className="text-center pt-5">Don't have an account? <a href="/register" className="text-accent hover:text-accent/50">Sign up for free</a></span>
                    </div>
                </div>
            </div>
        </section>
    )
}