"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, RotateCcw } from "lucide-react";
import { toast } from "react-toastify";
import { getScraperEgressStatus, rotateScraperEgress, type ScraperEgressStatus } from "@/services/adminArchiveService";

export default function ScraperEgressCard() {
  const [egress, setEgress] = useState<ScraperEgressStatus | null>(null);
  const [rotating, setRotating] = useState(false);

  const fetchEgress = useCallback(async () => {
    try {
      setEgress(await getScraperEgressStatus());
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchEgress();
  }, [fetchEgress]);

  const handleRotate = async () => {
    setRotating(true);
    try {
      const res = await rotateScraperEgress();
      if (res.rotated) {
        toast.success(`Scraper exit IP rotated${res.newIp ? ` → ${res.newIp}` : ""}`);
      } else {
        toast.info(`Rotation not applied${res.reason ? ` (${res.reason})` : ""}`);
      }
      await fetchEgress();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rotate scraper IP");
    } finally {
      setRotating(false);
    }
  };

  if (!egress) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-borders/30 bg-foreground/50 p-4 text-sm">
      <div className="flex items-start gap-2">
        <Globe className="size-4 mt-0.5 shrink-0 text-muted" />
        <div>
          <p className="text-primary">
            Scraper egress:{" "}
            {egress.proxyEnabled ? (
              <span className="text-teal-400">proxied</span>
            ) : (
              <span className="text-muted">direct (proxy off)</span>
            )}
          </p>
          <p className="text-muted">
            {egress.reachable ? (
              <>
                Exit IP <code className="text-primary">{egress.publicIp ?? "—"}</code>
                {egress.provider ? ` · ${egress.provider}` : ""}
              </>
            ) : (
              <span className="text-amber-400">
                Scraper VPN control unreachable{egress.reason ? `: ${egress.reason}` : ""}
              </span>
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleRotate}
        disabled={rotating}
        title="Stop→start the scraper gluetun to pick a new Mullvad exit IP"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-background border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50 self-start"
      >
        {rotating ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        Rotate scraper IP
      </button>
    </div>
  );
}
