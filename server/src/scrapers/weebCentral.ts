import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { discordService } from '@/services/discordService';
import logger from '@/services/loggerService';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import { WeebCentralSearcher } from '@/services/weebCentralSearcher';
import { appConfig } from '@/config/appConfig';

const STORAGE_ROOT = appConfig.scraper.chapterStorageRoot;
const safeName = (val: string) => {
    const cleaned = (val || 'chapter').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return cleaned || 'chapter';
};

export async function* scrapeWeebCentral(mangaName: string, checkExists: (num: string) => Promise<boolean>, seriesId?: number, romanizedTitle?: string, coverUrl?: string) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'});
    const page = await context.newPage();

    try {
        // Find best manga series match using search service
        const bestMatch = await WeebCentralSearcher.findBestMatch(mangaName, romanizedTitle, {
            seriesId,
            coverUrl,
        });

        if (!bestMatch) {
            console.error(`[ERR] Could not find manga link for "${mangaName}".`);
            return;
        }

        const mangaLink = { href: bestMatch.href, title: bestMatch.title };

        console.log(`[NAV] Found Series Page: ${mangaLink.href} (${mangaLink.title})`);
        await page.goto(mangaLink.href, { waitUntil: 'domcontentloaded' });

        const showAllBtnSelector = 'button[hx-get*="full-chapter-list"]';
        const btn = await page.$(showAllBtnSelector);
        if (btn) {
            await btn.click();
            await page.waitForSelector(showAllBtnSelector, { state: 'detached', timeout: 15000 });
        }

        const chapterRows = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('#chapter-list a[href*="/chapters/"]'));
            return links.map(anchor => {
                const url = (anchor as HTMLAnchorElement).href;
                const textElement = anchor.querySelector('span.grow span:not([x-show])');
                const fullTitle = textElement?.textContent?.trim() || "";

                return { url, title: fullTitle };
            }).reverse();
        });

        console.log(`[SYNC] Scraper found ${chapterRows.length} total chapters.`);

        for (const chap of chapterRows) {
            const parsed = ChapterNumberParser.parse(chap.title);
            if (await checkExists(parsed.number)) continue;
            yield { 
                url: chap.url, 
                title: parsed.title, 
                number: parsed.number,
                isSpecial: parsed.isSpecial,
                specialType: parsed.specialType
            };
        }
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
    }
}

export async function downloadChapterImagesStandalone(url: string, mangaName: string, folderName: string) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    try {
        // Block ads, trackers, and heavy resources that might cause ERR_ABORTED
        await page.route('**/*', (route) => {
            const request = route.request();
            const resourceType = request.resourceType();
            
            // Block heavy resources that aren't needed for image extraction
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                route.continue();
            } else if (['script'].includes(resourceType)) {
                // Allow critical scripts but block ad/tracker scripts
                const url = request.url();
                if (url.includes('google') || url.includes('facebook') || url.includes('ad') || url.includes('tracker')) {
                    route.abort();
                } else {
                    route.continue();
                }
            } else {
                route.continue();
            }
        });

        // Retry logic for navigation
        let lastError: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[WORKER] Navigating to ${folderName} (attempt ${attempt}/3)`);
                // Use domcontentloaded instead of networkidle to avoid timeouts
                // networkidle waits for all background requests (ads, trackers) to complete
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
                console.log(`[WORKER] Successfully navigated to ${folderName}`);
                break; // Success, exit retry loop
            } catch (err: any) {
                lastError = err;
                if (err.message.includes('ERR_ABORTED') || err.message.includes('net::')) {
                    console.warn(`[WORKER] Navigation error on attempt ${attempt}: ${err.message}`);
                    if (attempt < 3) {
                        await page.waitForTimeout(2000 * attempt); // Exponential backoff: 2s, 4s
                        // Try with a fresh page context
                        await page.close().catch(() => {});
                        const newPage = await context.newPage();
                        Object.assign(page, newPage);
                    }
                } else {
                    throw err; // Re-throw if it's a different error
                }
            }
        }
        
        if (lastError && lastError.message.includes('ERR_ABORTED')) {
            throw new Error(`Failed to load chapter page after 3 attempts: ${lastError.message}`);
        }
        
        // Wait a bit for images to start loading, then proceed
        await page.waitForTimeout(1000);
        
        // Try to wait for images, but don't fail if it times out
        try {
            await page.waitForSelector('img[alt*="Page"]', { timeout: 5000 });
        } catch (err) {
            console.log(`[WORKER] Image selector not found immediately for ${folderName}, continuing anyway... Error: ${(err as Error).message}`);
        }
        
        await page.evaluate(() => window.scrollBy(0, 500));

        // 1. Try Primary Selector
        let finalImages = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img.maw-w-full'))
                .map(img => img.getAttribute('data-src') || img.getAttribute('src'))
                .filter((src): src is string => !!src && (src.includes('planeptune.us') || src.includes('googleusercontent')));
        }).catch((err: any) => {
            console.warn(`[WORKER] Primary selector failed for ${folderName}: ${err.message}`);
            return [];
        });

        // 2. Try Fallback if primary failed
        if (finalImages.length === 0) {
            finalImages = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('img[alt*="Page"]'))
                    .map(img => img.getAttribute('src'))
                    .filter((src): src is string => !!src && src.startsWith('http'));
            }).catch((err: any) => {
                console.warn(`[WORKER] Fallback selector failed for ${folderName}: ${err.message}`);
                return [];
            });
        }

        // 3. LOG THE RESULT (Moved outside the IF blocks)
        console.log(`[WORKER] Found ${finalImages.length} images for ${folderName}`);

        if (finalImages.length === 0) {
            throw new Error(`No images found at ${url}`);
        }

        return await downloadImages(finalImages, mangaName, folderName, url);
    } finally {
        await page.close().catch(() => {}); // Ensure page is closed
        await context.close().catch(() => {}); // Ensure context is closed
        await browser.close().catch(() => {}); // Ensure browser is closed
    }
}

async function downloadImages(images: string[], mangaName: string, folderName: string, referer: string) {
    const dir = path.join(STORAGE_ROOT, safeName(mangaName), safeName(folderName));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    for (let i = 0; i < images.length; i++) {
        const filePath = path.join(dir, `image${(i + 1).toString().padStart(3, '0')}.jpg`);
        
        try {
            const response = await axios.get(images[i], {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'Referer': referer,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Pragma': 'no-cache',
                    'Sec-Fetch-Dest': 'image',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'cross-site'
                }
            });
            fs.writeFileSync(filePath, Buffer.from(response.data));
        } catch (err: any) {
            console.error(`[!] Failed image ${i+1} in ${folderName}: ${err.message}`);
            throw err; 
        }
    }
    return dir;
}