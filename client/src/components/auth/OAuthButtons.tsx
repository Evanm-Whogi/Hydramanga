"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { signIn } from "@/lib/auth";
import { markPendingOAuthRegister } from "@/lib/rybbit";

type OAuthProvider = "google" | "discord";

const ALL_PROVIDERS: { id: OAuthProvider; label: string; icon: string }[] = [
  { id: "google", label: "Google", icon: "/oauthIcons/googleLogo.png" },
  { id: "discord", label: "Discord", icon: "/oauthIcons/discord.webp" },
];

type OAuthButtonsProps = {
  disabled?: boolean;
  callbackURL?: string;
  oauthGoogleEnabled?: boolean;
  oauthDiscordEnabled?: boolean;
  oauthIntent?: "login" | "register";
};

export default function OAuthButtons({
  disabled = false,
  callbackURL = "/home",
  oauthGoogleEnabled = true,
  oauthDiscordEnabled = true,
  oauthIntent = "login",
}: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);

  const providers = useMemo(
    () => ALL_PROVIDERS.filter((p) => (p.id === 'google' ? oauthGoogleEnabled : oauthDiscordEnabled)),
    [oauthGoogleEnabled, oauthDiscordEnabled],
  );

  const handleOAuth = async (provider: OAuthProvider) => {
    if (disabled || loadingProvider) return;
    setLoadingProvider(provider);

    try {
      if (oauthIntent === "register") {
        markPendingOAuthRegister(provider);
      }

      const { error } = await signIn.social({
        provider,
        callbackURL,
        errorCallbackURL: "/login",
      });

      if (error) {
        toast.error(error.message || `Failed to sign in with ${provider}`);
        setLoadingProvider(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setLoadingProvider(null);
    }
  };

  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 mt-5 w-full">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-foreground" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-background px-3 text-muted">or continue with</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {providers.map(({ id, label, icon }) => {
          const isLoading = loadingProvider === id;
          const isDisabled = disabled || (loadingProvider !== null && !isLoading);

          return (
            <button
              key={id}
              type="button"
              onClick={() => handleOAuth(id)}
              disabled={isDisabled}
              className="flex items-center justify-center gap-3 p-3 hover:cursor-pointer rounded-lg border border-foreground/20 bg-foreground hover:bg-foreground/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Image src={icon} alt="" width={20} height={20} aria-hidden />
              <span>{isLoading ? `Connecting to ${label}…` : `Continue with ${label}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
