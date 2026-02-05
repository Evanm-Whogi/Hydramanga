"use client";
import { useState, useEffect, useRef } from "react";
import { signUp } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import InputField from '@/components/InputField';
import MasonryGrid from "@/components/MasonryGrid";
import { toast } from "react-toastify";
import { validateInviteCode, useInviteCode } from "@/services/inviteService";
import { trackAuthEvent } from "@/lib/analytics";
import { CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function RegisterContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const router = useRouter();
  const debounceTimer = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // If code is empty, reset validation
    if (!inviteCode.trim()) {
      setInviteValid(false);
      setInviteError(null);
      return;
    }

    // Set new timer to validate after 500ms of no typing
    setIsValidating(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        await validateInviteCode(inviteCode);
        setInviteValid(true);
        setInviteError(null);
      } catch (error: any) {
        setInviteValid(false);
        setInviteError(error.message || "Invalid invite code");
      } finally {
        setIsValidating(false);
      }
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [inviteCode]);

  const handleRegister = async () => {
    if (!inviteValid) {
      toast("Please validate an invite code first", { type: "error" });
      return;
    }

    const { data, error } = await signUp.email({
      email,
      password,
      name,
      callbackURL: "/dashboard",
      role: "user",
      bio: "",
    });
    if (error) {
      toast(`${error.message}`, { type: "error" });
    } else {
      trackAuthEvent('register', data.user?.id, data.user?.email, data.user?.name);
      // Mark invite code as used
      try {
        await useInviteCode(inviteCode, data.user.id);
      } catch (err: any) {
        console.error("Failed to mark invite as used:", err.message);
      }

      toast(`Welcome ${data.user.name}! Your account has been created.`, {
        type: "success",
      });
      router.push("/home");
    }
  };

  return (
    <section className="py-45">
      <div className="container mx-auto">
        <div className="flex flex-row">
          <div className="hidden md:block w-3/4 -z-50">
            <MasonryGrid />
          </div>
          <div className="flex flex-col w-full md:w-1/4 p-5 space-y-2">
            <Image
              src="/logo.png"
              width="192"
              height="192"
              alt="Register Logo"
              className="mx-auto"
            />
            <h1 className="text-4xl font-bold text-center">
              {process.env.NEXT_PUBLIC_NAME}
            </h1>
            <h2 className="text-muted text-center">
              Your one stop spot for endless Manga.
            </h2>
            <div className="flex flex-col space-y-3 mt-5">
              <div>
                <label className="text-sm font-semibold text-muted mb-1 block">
                  Invite Code *
                </label>
                  <div className="flex gap-2 relative">
                  <input
                    type="text"
                    placeholder="Enter invite code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      className={`w-full bg-foreground border border-borders text-muted px-4 py-2.5 rounded-xl outline-none transition-all focus:border-borders focus:ring-1 focus:ring-borders  ${
                        inviteValid ? 'border-green-500' : inviteError ? 'border-red-500' : 'border-foreground'
                      }`}
                  />
                    {isValidating && <div className="absolute right-3 top-2.5 animate-spin">⟳</div>}
                    {inviteValid && <CheckCircle className="absolute right-3 top-2.5 size-5 text-green-500" />}
                    {inviteError && !isValidating && <AlertCircle className="absolute right-3 top-2.5 size-5 text-red-500" />}
                </div>
                  {inviteError && <p className="text-xs text-red-500 mt-1">{inviteError}</p>}
                  {inviteValid && <p className="text-xs text-green-500 mt-1">✓ Invite code is valid</p>}
              </div>
              <InputField
                label="Full Name"
                placeholder="Your Name"
                value={name}
                onChange={(e: any) => setName(e.target.value)}
              />
              <InputField
                label="Email"
                placeholder="Email"
                value={email}
                onChange={(e: any) => setEmail(e.target.value)}
              />
              <InputField
                label="Password"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e: any) => setPassword(e.target.value)}
              />
            </div>
            <button
              onClick={handleRegister}
              disabled={!inviteValid}
              className="p-3 mt-5 bg-foreground text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Account
            </button>
            <span className="text-center pt-5">
              Already have an account?{" "}
              <Link href="/login" className="text-accent hover:text-accent/50">
                Log in
              </Link>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
