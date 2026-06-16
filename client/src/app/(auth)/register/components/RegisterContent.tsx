"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "react-toastify";
import { signUp } from "@/lib/auth";
import { identifyRybbitUser, trackUserRegister } from "@/lib/rybbit";
import { getUserDisplayName } from "@/lib/userDisplay";
import InputField from '@/components/InputField';
import OAuthButtons from "@/components/auth/OAuthButtons";
import MasonryGrid from "@/components/MasonryGrid";

export default function RegisterContent({ registrationEnabled = true, oauthGoogleEnabled = true, oauthDiscordEnabled = true }: { registrationEnabled?: boolean; oauthGoogleEnabled?: boolean; oauthDiscordEnabled?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const registrationDisabled = !registrationEnabled;
  const fieldsDisabled = registrationDisabled || isRegistering;

  const handleRegister = async () => {
    if (registrationDisabled) return;
    if (!username.trim() || !email.trim() || !password.trim()) {
      return toast.error("Please fill in all fields");
    }

    if (isRegistering) return;
    setIsRegistering(true);

    try {
      const trimmedUsername = username.trim();
      const { data, error } = await signUp.email({
        email: email.trim(),
        password,
        username: trimmedUsername,
        name: trimmedUsername,
        callbackURL: "/",
      });

      if (error) {
        toast.error(error.message || "Failed to create account");
        setIsRegistering(false);
        return;
      }

      toast.success(`Welcome ${getUserDisplayName(data.user)}! Your account has been created.`);

      identifyRybbitUser(data.user);
      trackUserRegister("email");

      window.location.href = "/";
    } catch (error: any) {
      toast.error(error?.message || "Failed to create account");
      setIsRegistering(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !fieldsDisabled) {
      handleRegister();
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
            <Image src="/logo.png" width="192" height="192" alt="Register Logo" className="mx-auto"/>
            <h1 className="text-4xl font-bold text-center">{process.env.NEXT_PUBLIC_NAME}</h1>
            <h2 className="text-muted text-center">Your one stop spot for endless Manga.</h2>
            {registrationDisabled && (
              <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-primary" role="status">
                Registration is currently disabled. Please check back later or contact an administrator.
              </div>
            )}
            <div className={`flex flex-col space-y-3 mt-5 ${registrationDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
              <InputField label="Username" placeholder="Username" value={username} onChange={(e: any) => setUsername(e.target.value)} onKeyPress={handleKeyPress} disabled={fieldsDisabled} />
              <InputField label="Email" placeholder="Email" value={email} onChange={(e: any) => setEmail(e.target.value)} onKeyPress={handleKeyPress} disabled={fieldsDisabled} />
              <InputField label="Password" placeholder="Password" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} onKeyPress={handleKeyPress} disabled={fieldsDisabled} />
            </div>
            <button onClick={handleRegister} disabled={fieldsDisabled} className="p-3 mt-5 bg-foreground shadow-md text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
              {isRegistering ? "Creating account..." : "Create Account"}
            </button>
            <div className={registrationDisabled ? 'opacity-50 pointer-events-none' : ''}>
              <OAuthButtons
                disabled={fieldsDisabled}
                oauthGoogleEnabled={oauthGoogleEnabled}
                oauthDiscordEnabled={oauthDiscordEnabled}
                oauthIntent="register"
              />
            </div>
            <span className="text-center pt-5">
              Already have an account?{" "}
              <Link href="/login" className="text-accent hover:text-accent/50">Log in</Link>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
