"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { signIn, requestPasswordReset } from "@/lib/auth";
import { trackAuthEvent } from "@/lib/analytics";
import { consumeAuthRedirectMessage } from "@/lib/authSession";
import InputField from '@/components/InputField';
import MasonryGrid from "@/components/MasonryGrid";

const DEFAULT_BAN_MESSAGE =
  "Your account has been suspended. Contact support if you believe this is an error.";

export default function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const stored = consumeAuthRedirectMessage();
    if (stored) {
      toast.error(stored, { autoClose: 10000 });
      return;
    }
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("banned")) {
      toast.error(DEFAULT_BAN_MESSAGE, { autoClose: 10000 });
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const handleLogin = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        const msg = result.error.message || "Authentication failed";
        const isBanned =
          msg.toLowerCase().includes("banned") ||
          msg.toLowerCase().includes("suspended") ||
          (result.error as { code?: string }).code === "BANNED_USER";
        toast(isBanned ? msg : msg, { type: "error", autoClose: isBanned ? 10000 : 5000 });
        setLoading(false);
        return;
      }

      trackAuthEvent('login', result.data?.user?.id, result.data?.user?.email, result.data?.user?.name);
      toast(`Welcome Back!`, { type: "success" });
      
      window.location.href = "/home";
    } catch (error: any) {
      toast(error?.message || "Login failed", { type: "error" });
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const targetEmail = resetEmail.trim() || email.trim();
    if (!targetEmail) {
      toast.error("Enter your email address");
      return;
    }
    if (resetLoading) return;
    setResetLoading(true);

    try {
      const { error } = await requestPasswordReset({
        email: targetEmail,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message || "Failed to send reset email");
        setResetLoading(false);
        return;
      }
      toast.success("If an account exists for that email, you will receive a reset link shortly.");
      setShowForgotPassword(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading && !showForgotPassword) {
      handleLogin();
    }
    if (e.key === 'Enter' && !resetLoading && showForgotPassword) {
      handleForgotPassword();
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

            {showForgotPassword ? (
              <div className="flex flex-col space-y-3 mt-5 w-full">
                <p className="text-sm text-muted text-center">
                  Enter your email and we will send you a link to reset your password.
                </p>
                <InputField
                  label="Email address"
                  placeholder="Email"
                  value={resetEmail || email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResetEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={resetLoading}
                />
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="p-3 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resetLoading ? "Sending…" : "Send reset link"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="text-sm text-muted hover:text-primary transition-colors"
                >
                  Back to login
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col space-y-3 mt-5 w-full">
                  <InputField label="Email address" placeholder="Email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} onKeyPress={handleKeyPress} disabled={loading} />
                  <InputField label="Your Password" placeholder="Password" type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} onKeyPress={handleKeyPress} disabled={loading} />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setShowForgotPassword(true);
                    }}
                    className="text-sm text-accent hover:text-accent/70 transition-colors hover:cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <button onClick={handleLogin} disabled={loading} className="p-3 mt-2 bg-foreground text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? "Logging in..." : "Login"}
                </button>
              </>
            )}

            {!showForgotPassword && (
              <>
                <div className="relative mt-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-foreground" />
                  </div>
                </div>
                <span className="text-center pt-5">
                  Don't have an account?{" "}
                  <Link href="/register" className="text-accent hover:text-accent/50">Sign up for free</Link>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
