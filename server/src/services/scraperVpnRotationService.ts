/**
 * Scraper VPN rotation service.
 *
 * Talks to the gluetun control API in front of *scraper* egress (a separate
 * container from the torrent gluetun, so rotating a banned scraper exit never blips
 * active torrents). Modeled on `vpnGuardService` — same control-API client shape,
 * pointed at `appConfig.scraper.egressVpn.controlUrl`.
 *
 *  - `getStatus()` reads the current exit IP/org.
 *  - `rotate()` forces gluetun to reconnect (stop → start), which makes Mullvad
 *    re-pick a server from the container's `SERVER_CITIES`. It's guarded by an
 *    in-flight lock + cooldown so a burst of ban signals (or a manual click during
 *    an auto-rotation) causes exactly **one** rotation; it logs old→new IP and warns
 *    if the IP didn't actually change.
 *
 * Rotation is meaningful only when scraper traffic is actually proxied through this
 * gluetun; with the proxy flag off, `rotate()` still works if invoked manually but
 * auto-rotation never fires (see `scraperBanDetection`).
 */
import axios from 'axios';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';

export interface ScraperEgressStatus {
    /** Public exit IP reported by gluetun, when reachable. */
    publicIp?: string;
    /** Org/ASN gluetun reports for the exit (e.g. the Mullvad hosting org). */
    provider?: string;
    /** Set when the control server couldn't be reached / parsed. */
    reason?: string;
}

export interface RotateResult {
    rotated: boolean;
    previousIp?: string;
    newIp?: string;
    reason?: string;
}

class ScraperVpnRotationService {
    private rotating: Promise<RotateResult> | null = null;
    private lastRotateAt = 0;

    private get cfg() {
        return appConfig.scraper.egressVpn;
    }

    private get base() {
        return this.cfg.controlUrl.replace(/\/$/, '');
    }

    /** Read the current exit IP/org from gluetun. Never throws. */
    async getStatus(): Promise<ScraperEgressStatus> {
        try {
            const resp = await axios.get(`${this.base}/v1/publicip/ip`, { timeout: this.cfg.timeout });
            const data = resp.data ?? {};
            return {
                publicIp: data.public_ip || data.ip || undefined,
                provider: data.organization || data.vpn_service_provider || undefined,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { reason: `gluetun control server unreachable at ${this.base}: ${message}` };
        }
    }

    /**
     * Force a new exit IP. Concurrent callers share the in-flight rotation; calls
     * within `rotateCooldownMs` of the last rotation are skipped (returns the
     * unchanged status). `reason` is logged for auditing why a rotation happened.
     */
    async rotate(reason = 'manual'): Promise<RotateResult> {
        if (this.rotating) return this.rotating;

        const sinceLast = Date.now() - this.lastRotateAt;
        if (sinceLast < this.cfg.rotateCooldownMs) {
            const status = await this.getStatus();
            logger.info(
                `[scraperVpn] Rotation requested (${reason}) but within cooldown (${Math.round(sinceLast / 1000)}s < ${Math.round(this.cfg.rotateCooldownMs / 1000)}s) — skipping`,
                { service: 'scraperVpnRotationService' }
            );
            return { rotated: false, newIp: status.publicIp, reason: 'cooldown' };
        }

        this.rotating = this.performRotate(reason).finally(() => {
            this.rotating = null;
            this.lastRotateAt = Date.now();
        });
        return this.rotating;
    }

    private async setVpnStatus(status: 'stopped' | 'running'): Promise<void> {
        await axios.put(`${this.base}/v1/vpn/status`, { status }, { timeout: this.cfg.timeout });
    }

    private async performRotate(reason: string): Promise<RotateResult> {
        const before = await this.getStatus();
        logger.info(`[scraperVpn] Rotating exit IP (${reason}); current ip=${before.publicIp ?? 'n/a'}`, {
            service: 'scraperVpnRotationService',
        });

        try {
            await this.setVpnStatus('stopped');
            await this.delay(1500);
            await this.setVpnStatus('running');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`[scraperVpn] Rotation control call failed: ${message}`, {
                service: 'scraperVpnRotationService',
            });
            return { rotated: false, previousIp: before.publicIp, reason: message };
        }

        // Wait for the tunnel to re-establish and report a fresh public IP.
        const after = await this.waitForNewIp(before.publicIp);
        if (!after.publicIp) {
            logger.warn('[scraperVpn] Rotation issued but no public IP reported yet (tunnel still reconnecting)', {
                service: 'scraperVpnRotationService',
            });
            return { rotated: false, previousIp: before.publicIp, reason: 'no-ip-after-rotate' };
        }
        if (after.publicIp === before.publicIp) {
            logger.warn(`[scraperVpn] Rotation completed but IP unchanged (${after.publicIp}) — too few SERVER_CITIES?`, {
                service: 'scraperVpnRotationService',
            });
            return { rotated: false, previousIp: before.publicIp, newIp: after.publicIp, reason: 'ip-unchanged' };
        }

        logger.info(`[scraperVpn] Rotated exit IP ${before.publicIp ?? 'n/a'} → ${after.publicIp}`, {
            service: 'scraperVpnRotationService',
        });
        return { rotated: true, previousIp: before.publicIp, newIp: after.publicIp };
    }

    private async waitForNewIp(previousIp?: string, attempts = 15, intervalMs = 2000): Promise<ScraperEgressStatus> {
        let last: ScraperEgressStatus = {};
        for (let i = 0; i < attempts; i++) {
            await this.delay(intervalMs);
            last = await this.getStatus();
            if (last.publicIp && last.publicIp !== previousIp) return last;
        }
        return last;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export const scraperVpnRotationService = new ScraperVpnRotationService();
export { ScraperVpnRotationService };
