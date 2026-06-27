/**
 * Archive maintenance — operator cleanup for the torrent pipeline.
 *
 * These methods MUST run on the WORKER: it is the only process with the scratch-disk
 * mount and a proven path to qBittorrent (the API container has neither), so the admin
 * controller enqueues `archiveMaintenanceQueue` jobs rather than calling here directly.
 *
 * `purgeOrphans()` reconciles the download client + scratch disk against the
 * acquisition_jobs table: any torrent in our qBittorrent category that no live job
 * references is removed (stops seeding + deletes its files), and stale scratch
 * directories left behind by crashed/aborted jobs are swept.
 *
 * Safety: a `downloading` job has no localPath yet (set only on completion) and
 * qBittorrent downloads INTO the scratch dir, so the FS sweep protects every path
 * referenced by a current category torrent OR a non-terminal job, and only removes
 * entries older than a grace window. Genuinely-active downloads are never touched.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { db } from '@/db';
import { acquisitionJobs } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { qbittorrentClient } from '@/archive/QbittorrentClient';

/** Statuses whose torrent/files are still in use and must be preserved. */
const ACTIVE_STATUSES = ['searching', 'downloading', 'downloaded', 'ingesting', 'needs_review'] as const;
/** Only sweep scratch entries older than this (avoid racing a just-started job). */
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export interface OrphanPurgeResult {
    torrentsRemoved: number;
    dirsRemoved: number;
    skipped: number;
}

class ArchiveMaintenanceService {
    async purgeOrphans(): Promise<OrphanPurgeResult> {
        const activeJobs = await db
            .select({ clientHandle: acquisitionJobs.clientHandle, localPath: acquisitionJobs.localPath })
            .from(acquisitionJobs)
            .where(inArray(acquisitionJobs.status, [...ACTIVE_STATUSES]));

        const activeHandles = new Set(
            activeJobs.map((j) => j.clientHandle?.toLowerCase()).filter((h): h is string => !!h)
        );

        // 1. Remove qBittorrent torrents in our category that no live job owns.
        let torrentsRemoved = 0;
        const torrents = await qbittorrentClient.listCategory().catch((err) => {
            logger.warn(`[MAINT] Could not list torrents: ${err}`, { service: 'archiveMaintenanceService' });
            return [] as { hash: string; name: string; state: string; path?: string }[];
        });
        const livePaths = new Set<string>();
        for (const j of activeJobs) if (j.localPath) livePaths.add(path.resolve(j.localPath));
        for (const t of torrents) {
            if (activeHandles.has(t.hash)) {
                if (t.path) livePaths.add(path.resolve(t.path));
                continue;
            }
            await qbittorrentClient.remove(t.hash, true).then(
                () => { torrentsRemoved++; },
                (err) => logger.warn(`[MAINT] Failed to remove torrent ${t.hash}: ${err}`, { service: 'archiveMaintenanceService' })
            );
        }

        // 2. Sweep stale scratch entries not protected by any live path.
        const { dirsRemoved, skipped } = await this.sweepScratch(livePaths);

        logger.info(`[MAINT] Orphan purge: removed ${torrentsRemoved} torrent(s), ${dirsRemoved} scratch dir(s), skipped ${skipped}`, {
            service: 'archiveMaintenanceService',
        });
        return { torrentsRemoved, dirsRemoved, skipped };
    }

    /**
     * Remove a single torrent (stop seeding) and, when asked, its downloaded files.
     * qBittorrent deletes files for torrents it still manages; for a needs_review pack
     * (torrent already removed, files kept on disk) we also rm the localPath directly.
     */
    async removeTorrentAndFiles(handle: string, deleteFiles: boolean, localPath?: string | null): Promise<void> {
        await qbittorrentClient.remove(handle, deleteFiles).catch((err) =>
            logger.warn(`[MAINT] Failed to remove torrent ${handle}: ${err}`, { service: 'archiveMaintenanceService' })
        );
        if (deleteFiles && localPath) await this.removeScratchPath(localPath);
    }

    /** Delete a path, but only inside the scratch dir (guards against a bad localPath). */
    private async removeScratchPath(targetPath: string): Promise<void> {
        const scratchDir = path.resolve(appConfig.archive.pipeline.scratchDir);
        const resolved = path.resolve(targetPath);
        if (resolved !== scratchDir && !resolved.startsWith(scratchDir + path.sep)) {
            logger.warn(`[MAINT] Refusing to delete path outside scratch: ${resolved}`, { service: 'archiveMaintenanceService' });
            return;
        }
        if (resolved === scratchDir) return; // never nuke the whole scratch root
        await fs.rm(resolved, { recursive: true, force: true }).catch((err) =>
            logger.warn(`[MAINT] Failed to delete ${resolved}: ${err}`, { service: 'archiveMaintenanceService' })
        );
    }

    private async sweepScratch(livePaths: Set<string>): Promise<{ dirsRemoved: number; skipped: number }> {
        const scratchDir = path.resolve(appConfig.archive.pipeline.scratchDir);
        let dirsRemoved = 0;
        let skipped = 0;

        let entries: import('fs').Dirent[];
        try {
            entries = await fs.readdir(scratchDir, { withFileTypes: true });
        } catch {
            return { dirsRemoved, skipped };
        }

        for (const entry of entries) {
            const full = path.resolve(scratchDir, entry.name);
            // Protect anything a live torrent/job points at (equal, ancestor, or descendant).
            const isLive = [...livePaths].some((lp) => lp === full || lp.startsWith(full + path.sep) || full.startsWith(lp + path.sep));
            if (isLive) { skipped++; continue; }

            const stat = await fs.stat(full).catch(() => null);
            if (!stat || Date.now() - stat.mtimeMs < ORPHAN_MIN_AGE_MS) { skipped++; continue; }

            await fs.rm(full, { recursive: true, force: true }).then(
                () => { dirsRemoved++; },
                (err) => { skipped++; logger.warn(`[MAINT] Failed to remove ${full}: ${err}`, { service: 'archiveMaintenanceService' }); }
            );
        }
        return { dirsRemoved, skipped };
    }
}

export const archiveMaintenanceService = new ArchiveMaintenanceService();
export { ArchiveMaintenanceService };
