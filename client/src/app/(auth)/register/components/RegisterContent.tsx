"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "react-toastify";
import { signUp } from "@/lib/auth";
import { trackAuthEvent } from "@/lib/analytics";
import { getUserDisplayName } from "@/lib/userDisplay";
import InputField from '@/components/InputField';
import MasonryGrid from "@/components/MasonryGrid";

export default function RegisterContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const handleRegister = async () => {
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
        callbackURL: "/home",
      });

      if (error) {
        toast.error(error.message || "Failed to create account");
        setIsRegistering(false);
        return;
      }

      trackAuthEvent(
        'register',
        data.user?.id,
        data.user?.email,
        getUserDisplayName(data.user)
      );

      toast.success(`Welcome ${getUserDisplayName(data.user)}! Your account has been created.`);

      window.location.href = "/home";
    } catch (error: any) {
      toast.error(error?.message || "Failed to create account");
      setIsRegistering(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isRegistering) {
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
            <div className="flex flex-col space-y-3 mt-5">
              <InputField label="Username" placeholder="Username" value={username} onChange={(e: any) => setUsername(e.target.value)} onKeyPress={handleKeyPress} disabled={isRegistering} />
              <InputField label="Email" placeholder="Email" value={email} onChange={(e: any) => setEmail(e.target.value)} onKeyPress={handleKeyPress} disabled={isRegistering} />
              <InputField label="Password" placeholder="Password" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} onKeyPress={handleKeyPress} disabled={isRegistering} />
            </div>
            <button onClick={handleRegister} disabled={isRegistering} className="p-3 mt-5 bg-foreground text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
              {isRegistering ? "Creating account..." : "Create Account"}
            </button>
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
