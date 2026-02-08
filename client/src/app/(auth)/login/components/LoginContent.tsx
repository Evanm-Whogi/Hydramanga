"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "react-toastify";
import { signIn } from "@/lib/auth";
import { trackAuthEvent } from "@/lib/analytics";
import InputField from '@/components/InputField';
import MasonryGrid from "@/components/MasonryGrid";

export default function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        toast(result.error.message || "Authentication failed", { type: "error" });
        setLoading(false);
        return;
      }

      trackAuthEvent('login', result.data?.user?.id, result.data?.user?.email, result.data?.user?.name);
      toast(`Welcome Back!`, { type: "success" });
      
      // Use full page redirect to ensure session cookie is properly loaded
      window.location.href = "/home";
      // Don't set loading to false - we're redirecting away
    } catch (error: any) {
      toast(error?.message || "Login failed", { type: "error" });
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleLogin();
    }
  };

  return (
    <section id="header" className="py-45">
      <div className="container mx-auto">
        <div className="flex flex-row">
          <div className="hidden md:block w-3/4 -z-50">
            <MasonryGrid />
          </div>
          <div className="flex flex-col w-full md:w-1/4 p-5 space-y-2">
            <Image src="/logo.png" width="192" height="192" alt="Login Logo" className="mx-auto"/>
            <h1 className="text-4xl font-bold text-center">{process.env.NEXT_PUBLIC_NAME}</h1>
            <h2 className="text-muted text-center">Your one stop spot for endless Manga.</h2>
            <div className="flex flex-col space-y-3 mt-5 w-full">
              <InputField label="Email address" placeholder="Email" value={email} onChange={(e: any) => setEmail(e.target.value)} onKeyPress={handleKeyPress} disabled={loading} />
              <InputField label="Your Password" placeholder="Password" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} onKeyPress={handleKeyPress} disabled={loading} />
            </div>
            <button onClick={handleLogin} disabled={loading} className="p-3 mt-5 bg-foreground text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Logging in..." : "Login"}
            </button>
            <div className="relative mt-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-foreground" />
              </div>
            </div>
            <span className="text-center pt-5">
              Don't have an account?{" "}
              <Link href="/register" className="text-accent hover:text-accent/50">Sign up for free</Link>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
