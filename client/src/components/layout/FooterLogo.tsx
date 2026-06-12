"use client";

import { useCallback, useRef } from "react";
import Image from "next/image";
import { toast } from "react-toastify";
import { apiPost } from "@/lib/api";
import { useUser } from "@/providers/UserProvider";

const CLICK_TARGET = 20;
const RESET_MS = 3000;

export default function FooterLogo() {
  const { user } = useUser();
  const countRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    countRef.current = 0;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleClick = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(reset, RESET_MS);

    countRef.current += 1;
    if (countRef.current < CLICK_TARGET) return;

    reset();
    if (!user) {
      toast.info("Sign in to earn the Easter Egg Hunter badge.");
      return;
    }

    try {
      const data = await apiPost("/users/me/badges/easter-egg");
      if ((data as { granted?: boolean }).granted) {
        toast.success("Easter Egg Hunter badge unlocked!");
      }
    } catch {
      toast.error("Could not claim badge. Try again while signed in.");
    }
  };

  return (
    <button type="button" onClick={handleClick} className="shrink-0 rounded-lg hover:opacity-90 transition-opacity" aria-label="Hydra Manga logo">
      <Image src="/logoIcon.png" alt="Logo" width={100} height={100} loading="eager" className="object-contain" style={{ height: "4.5rem", width: "auto" }} />
    </button>
  );
}
