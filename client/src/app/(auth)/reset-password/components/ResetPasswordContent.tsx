"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { toast } from "react-toastify";
import { resetPassword } from "@/lib/auth";
import InputField from "@/components/InputField";
import MasonryGrid from "@/components/MasonryGrid";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const error = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (!token) {
      toast.error("Invalid or missing reset link. Request a new reset email.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (loading) return;
    setLoading(true);

    try {
      const { error: resetError } = await resetPassword({ newPassword: password, token });
      if (resetError) {
        toast.error(resetError.message || "Failed to reset password");
        setLoading(false);
        return;
      }
      setDone(true);
      toast.success("Password updated. You can sign in with your new password.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) handleReset();
  };

  if (error === "INVALID_TOKEN" || (!token && !done)) {
    return (
      <div className="flex flex-col w-full md:w-1/4 p-5 space-y-4 text-center">
        <Image src="/logo.png" width={192} height={192} alt="Logo" className="mx-auto" />
        <h1 className="text-2xl font-bold text-primary">Link expired</h1>
        <p className="text-muted text-sm">
          This password reset link is invalid or has expired. Request a new one from the login page.
        </p>
        <Link
          href="/login"
          className="p-3 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
        >
          Back to login
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col w-full md:w-1/4 p-5 space-y-4 text-center">
        <Image src="/logo.png" width={192} height={192} alt="Logo" className="mx-auto" />
        <h1 className="text-2xl font-bold text-primary">Password updated</h1>
        <p className="text-muted text-sm">Your password has been reset successfully.</p>
        <Link
          href="/login"
          className="p-3 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full md:w-1/4 p-5 space-y-2">
      <Image src="/logo.png" width={192} height={192} alt="Logo" className="mx-auto" />
      <h1 className="text-4xl font-bold text-center">{process.env.NEXT_PUBLIC_NAME}</h1>
      <h2 className="text-muted text-center">Choose a new password</h2>
      <div className="flex flex-col space-y-3 mt-5 w-full">
        <InputField
          label="New password"
          placeholder="At least 8 characters"
          type="password"
          value={password}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
        />
        <InputField
          label="Confirm password"
          placeholder="Repeat password"
          type="password"
          value={confirmPassword}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
        />
      </div>
      <button
        type="button"
        onClick={handleReset}
        disabled={loading || !password || !confirmPassword}
        className="p-3 mt-5 bg-foreground text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Updating…" : "Update password"}
      </button>
      <span className="text-center pt-3 text-sm text-muted">
        <Link href="/login" className="text-accent hover:text-accent/50">
          Back to login
        </Link>
      </span>
    </div>
  );
}

export default function ResetPasswordContent() {
  return (
    <section id="header" className="py-45">
      <div className="container mx-auto">
        <div className="flex flex-row">
          <div className="hidden md:block w-3/4 -z-50">
            <MasonryGrid />
          </div>
          <Suspense
            fallback={
              <div className="flex flex-col w-full md:w-1/4 p-5 text-center text-muted">
                Loading…
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
