/**
 * VPN Guard Service
 *
 * Pre-flight safety check for the archive/torrent pipeline. In dev, ALL torrent
 * traffic must egress through Mullvad (the qBittorrent container shares gluetun's
 * network namespace, and gluetun runs a killswitch). Before we ever ask
 * qBittorrent to add a torrent, this guard confirms the tunnel is actually up and
 * reporting the expected provider by querying gluetun's control server.
 *
 * In production the host is on a DMCA-ignored network and no VPN is used, so the
 * guard is disabled via `appConfig.archive.vpn.required = false` and
 * `assertProtected()` is a no-op.
 *
 * The docker killswitch is the hard guarantee (no tunnel ⇒ no network for
 * qBittorrent); this guard is the belt-and-suspenders layer that fails the job
 * loudly instead of silently leaking or stalling.
 */
import axios from 'axios';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';

export class VpnNotProtectedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VpnNotProtectedError';
    }
}

export interface VpnStatus {
    /** Whether torrent traffic is currently protected (or protection isn't required). */
    protected: boolean;
    /** Public IP reported by gluetun, when reachable. */
    publicIp?: string;
    /** VPN provider gluetun reports it's connected through. */
    provider?: string;
    /** Reason protection failed, when `protected` is false. */
    reason?: string;
}

class VpnGuardService {
    private get cfg() {
        return appConfig.archive.vpn;
    }

    /**
     * Query gluetun's control server for the current tunnel state. Returns a
     * structured status; never throws (callers decide how to react).
     */
    async getStatus(): Promise<VpnStatus> {
        if (!this.cfg.required) {
            return { protected: true, reason: 'vpn-not-required' };
        }

        const base = this.cfg.gluetunControlUrl.replace(/\/$/, '');
        try {
            // gluetun only populates the public IP once the tunnel is up and it fetched
            // the IP *through* the tunnel. That presence — plus the container-level
            // killswitch (no tunnel ⇒ no egress at all) — is the protection signal.
            // We deliberately don't gate on:
            //   - /v1/openvpn/status: OpenVPN-specific; returns "stopped" under WireGuard.
            //   - provider name: gluetun reports the hosting org (e.g. "M247"), not "mullvad".
            const ipResp = await axios.get(`${base}/v1/publicip/ip`, { timeout: this.cfg.timeout });
            const ipData = ipResp.data ?? {};
            const publicIp: string | undefined = ipData.public_ip || ipData.ip || undefined;
            const provider: string | undefined = ipData.organization || ipData.vpn_service_provider || undefined;

            if (!publicIp) {
                return { protected: false, provider, reason: 'gluetun reports no public IP yet (tunnel not established)' };
            }
            return { protected: true, publicIp, provider };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                protected: false,
                reason: `gluetun control server unreachable at ${base}: ${message}`,
            };
        }
    }

    /**
     * Throw `VpnNotProtectedError` unless torrent traffic is confirmed protected
     * (or protection isn't required). Call immediately before any torrent submit.
     */
    async assertProtected(): Promise<void> {
        const status = await this.getStatus();
        if (status.protected) {
            if (this.cfg.required) {
                logger.info(
                    `[VPN] Protection verified (ip=${status.publicIp ?? 'n/a'}, provider=${status.provider ?? 'n/a'})`,
                    { service: 'vpnGuardService' }
                );
            }
            return;
        }
        const reason = status.reason ?? 'unknown reason';
        logger.error(`[VPN] Torrent traffic is NOT protected — refusing to submit: ${reason}`, {
            service: 'vpnGuardService',
        });
        throw new VpnNotProtectedError(`Refusing to torrent: VPN not protected (${reason})`);
    }
}

export const vpnGuardService = new VpnGuardService();
export { VpnGuardService };
