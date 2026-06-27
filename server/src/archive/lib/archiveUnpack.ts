/**
 * Filesystem helpers for archive ingestion: detect/extract container formats,
 * walk for image pages, natural-sort, and the out-of-process JXL→PNG fallback.
 *
 * Extraction uses CLI tools baked into the worker image (Dockerfile.worker):
 *   - `unar`  : universal extractor (zip/cbz, rar/cbr incl. RAR5, 7z)
 *   - `djxl`  : JPEG-XL decode (sharp/libvips can't decode JXL)
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';

const execFileAsync = promisify(execFile);

const IMAGE_EXTS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.jxl', '.tif', '.tiff',
]);
// .epub is a ZIP container — unar extracts it like any zip; images land under
// OEBPS/ and are collected by the normal walk (xhtml/opf/ncx/css filtered as junk).
const ARCHIVE_EXTS = new Set(['.zip', '.cbz', '.rar', '.cbr', '.7z', '.cb7', '.tar', '.epub']);
const JUNK_NAMES = new Set(['thumbs.db', '.ds_store', 'desktop.ini']);

export function isImageFile(name: string): boolean {
    return IMAGE_EXTS.has(path.extname(name).toLowerCase());
}
export function isArchiveFile(name: string): boolean {
    return ARCHIVE_EXTS.has(path.extname(name).toLowerCase());
}
export function isJxlFile(name: string): boolean {
    return path.extname(name).toLowerCase() === '.jxl';
}
function isJunk(name: string): boolean {
    const lower = name.toLowerCase();
    if (JUNK_NAMES.has(lower)) return true;
    if (lower.startsWith('.')) return true; // dotfiles (.nfo handled by ext too)
    return ['.nfo', '.txt', '.sfv', '.url', '.md', '.json', '.xml'].includes(path.extname(lower));
}

/** Recursively list every file under `root` (absolute paths). */
export async function walkFiles(root: string): Promise<string[]> {
    const out: string[] = [];
    async function recurse(dir: string): Promise<void> {
        let entries: import('fs').Dirent[];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) await recurse(full);
            else if (e.isFile()) out.push(full);
        }
    }
    await recurse(root);
    return out;
}

/** Collect ordered image-page paths under the given roots (junk filtered). */
export async function collectImages(roots: string[]): Promise<string[]> {
    const images: string[] = [];
    for (const root of roots) {
        for (const file of await walkFiles(root)) {
            const name = path.basename(file);
            if (isJunk(name)) continue;
            if (isImageFile(name)) images.push(file);
        }
    }
    return images;
}

/**
 * Numeric-aware comparator so `2.jpg` sorts before `10.jpg` and
 * `ch1/005` before `ch1/010`. Compares full paths segment-by-segment.
 */
export function naturalCompare(a: string, b: string): number {
    const ax = a.toLowerCase().match(/(\d+|\D+)/g) ?? [];
    const bx = b.toLowerCase().match(/(\d+|\D+)/g) ?? [];
    const n = Math.min(ax.length, bx.length);
    for (let i = 0; i < n; i++) {
        const an = ax[i];
        const bn = bx[i];
        if (an === bn) continue;
        const aNum = /^\d+$/.test(an);
        const bNum = /^\d+$/.test(bn);
        if (aNum && bNum) {
            const d = parseInt(an, 10) - parseInt(bn, 10);
            if (d !== 0) return d;
        } else {
            return an < bn ? -1 : 1;
        }
    }
    return ax.length - bx.length;
}

/** Whether `djxl` is available on PATH (cached). */
let djxlAvailable: boolean | null = null;
export async function isDjxlAvailable(): Promise<boolean> {
    if (djxlAvailable !== null) return djxlAvailable;
    try {
        await execFileAsync(appConfig.archive.pipeline.djxlPath, ['--version'], { timeout: 10_000 });
        djxlAvailable = true;
    } catch {
        djxlAvailable = false;
    }
    return djxlAvailable;
}

/** Decode a `.jxl` page to a PNG buffer via the out-of-process `djxl` tool. */
export async function decodeJxlToPng(jxlPath: string): Promise<Buffer> {
    const tmp = path.join(os.tmpdir(), `jxl-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    try {
        await execFileAsync(appConfig.archive.pipeline.djxlPath, [jxlPath, tmp], { timeout: 60_000 });
        return await fs.readFile(tmp);
    } finally {
        await fs.unlink(tmp).catch(() => {});
    }
}

/**
 * Extract one archive into `destDir` using `unar`. Returns true on success.
 */
async function extractOne(archivePath: string, destDir: string): Promise<boolean> {
    await fs.mkdir(destDir, { recursive: true });
    try {
        await execFileAsync(
            'unar',
            ['-quiet', '-force-overwrite', '-output-directory', destDir, archivePath],
            { timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }
        );
        return true;
    } catch (err) {
        logger.warn(
            `[UNPACK] Failed to extract ${path.basename(archivePath)}: ${err instanceof Error ? err.message : err}`,
            { service: 'archiveUnpack' }
        );
        return false;
    }
}

/**
 * Recursively extract all archives found under `source` into `workDir`, handling
 * nested archives (e.g. a torrent of one `.cbz` per volume). Returns the roots to
 * scan for images: the original source (for loose images) plus the work dir.
 * Capped recursion depth guards against archive bombs / pathological nesting.
 */
export async function unpack(source: string, workDir: string, maxDepth = 3): Promise<string[]> {
    await fs.mkdir(workDir, { recursive: true });

    // qBittorrent reports `content_path` as the file itself for single-file
    // torrents (e.g. one `.cbz`), but walkFiles expects a directory. Normalize to
    // the parent dir so the archive is discovered and extracted in either case.
    const stat = await fs.stat(source).catch(() => null);
    const sourceRoot = stat?.isFile() ? path.dirname(source) : source;

    const extractPass = async (scanRoot: string, depth: number): Promise<void> => {
        if (depth > maxDepth) return;
        const files = await walkFiles(scanRoot);
        const archives = files.filter((f) => isArchiveFile(path.basename(f)));
        for (const archive of archives) {
            // Mirror the archive's name into the work dir to keep volumes distinct.
            const rel = path.relative(scanRoot, archive).replace(/[/\\]/g, '__');
            const dest = path.join(workDir, `${rel}.d`);
            const ok = await extractOne(archive, dest);
            if (ok) await extractPass(dest, depth + 1); // handle nested archives
        }
    };

    await extractPass(sourceRoot, 0);
    return [sourceRoot, workDir];
}
