import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { discordService } from '@/services/discordService';
import logger from '@/services/loggerService';

const STORAGE_ROOT = process.env.CHAPTER_STORAGE_ROOT || path.join(process.cwd(), 'chapters');
const safeName = (val: string) => {
    const cleaned = (val || 'chapter').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return cleaned || 'chapter';
};

// Normalize search strings to improve match rates on finicky search bars
const normalizeQuery = (val?: string) => {
    if (!val) return '';
    return val
        .replace(/[-_.]+/g, ' ')   // turn dashes/underscores/dots into spaces
        .replace(/[^\p{L}\p{N}\s]/gu, '') // drop other punctuation
        .replace(/\s+/g, ' ')
        .trim();
};

export async function* scrapeWeebCentral(mangaName: string, checkExists: (num: string) => Promise<boolean>, seriesId?: number, romanizedTitle?: string, coverUrl?: string) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'});
    const page = await context.newPage();

    try {
        const searchViAPI = async (variant: string) => {
            try {
                console.log(`[SEARCH] Querying API for "${variant}"`);
                const response = await axios.post('https://weebcentral.com/search/simple?location=main', new URLSearchParams({ text: variant }),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    }
                );

                // Parse the HTML response
                const dom = new JSDOM(response.data);
                const anchors = Array.from(dom.window.document.querySelectorAll('a[href*="/series/"]'));
                const search = variant.toLowerCase().trim();

                console.log(`[SEARCH] Found ${anchors.length} results for "${variant}"`);

                // Scoring function for match quality
                const scoreMatch = (a: Element) => {
                    const text = a.querySelector('div.line-clamp-2')?.textContent?.trim().toLowerCase() || '';
                    const urlHref = a.getAttribute('href')?.toLowerCase() || '';
                    
                    // Exact match gets highest score
                    if (text === search) return 100;
                    
                    // Word boundary match
                    const wordBoundary = new RegExp(`\\b${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
                    if (wordBoundary.test(text)) return 90;
                    
                    // URL slug exact match
                    const searchSlug = search.replace(/\s+/g, '-');
                    if (urlHref.includes(`/${searchSlug}`) || urlHref.endsWith(searchSlug)) return 80;
                    
                    // Starts with search term
                    if (text.startsWith(search)) return 70;
                    
                    // Contains search (fallback)
                    if (text.includes(search)) return 50;
                    
                    return 0;
                };

                const results = anchors.map((a: any) => {
                    const href = (a as any).href;
                    const title = a.querySelector('div.line-clamp-2')?.textContent?.trim();
                    const score = scoreMatch(a);
                    return { href, title, score };
                }).sort((a, b) => b.score - a.score);

                if (results.length > 0) {
                    console.log(`[SEARCH] Top result: "${results[0].title}" (score: ${results[0].score})`);
                    logger.info(`[SEARCH] Top result for "${variant}": "${results[0].title}" (score: ${results[0].score})`, { service: 'weebCentralScraper' });
                }

                return results;
            } catch (error) {
                console.error(`[SEARCH] API error for "${variant}":`, error);
                return [];
            }
        };

        // Build search variants to cope with variations
        const searchVariants = [
            mangaName,
            normalizeQuery(mangaName),
            romanizedTitle,
            normalizeQuery(romanizedTitle)
        ].filter((v): v is string => !!v)
         .filter((v, idx, arr) => arr.indexOf(v) === idx); // unique

        let bestMatch: { href: string; title?: string; score: number } | undefined;
        let results: Array<{ href: string; title?: string; score: number }> = [];

        for (const variant of searchVariants) {
            results = await searchViAPI(variant);
            bestMatch = results.find(r => r.score > 0);

            if (bestMatch) break; // found a viable match
        }

        // If nothing scored, fall back to first result from the last search
        if (!bestMatch && results.length > 0) {
            const firstResult = results[0];
            if (firstResult.title?.toLowerCase() !== 'random') {
                console.log(`[DEFAULT] Using fallback result: "${firstResult.title}"`);
                bestMatch = firstResult;
            }
        }

        if (!bestMatch) {
            console.error(`[ERR] Could not find manga link for "${mangaName}". Titles found:`, results.slice(0, 3).map(r => r.title));
            
            if (seriesId) {
                const foundTitles = results.slice(0, 3).map(r => ({ text: r.title || '', url: r.href }));
                await discordService.notifyScraperFailed(mangaName, seriesId, foundTitles, coverUrl);
            }
            
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
                let fullTitle = textElement?.textContent?.trim() || "";

                const numMatch = fullTitle.match(/(\d+(\.\d+)?)/);
                let chapterNumber = numMatch ? numMatch[0] : "0";

                // FIX: If it's a Prologue, offset it so it doesn't clash with Chapter 1, 2, etc. I mostly did this for berserk but im sure it will apply 
                // to other mangas as well.
                if (fullTitle.toLowerCase().includes('prologue')) {
                    chapterNumber = `0.${chapterNumber}`; // Converts "Prologue 1" to "0.1", "Prologue 2" to "0.2", etc.
                }

                if (!isNaN(Number(fullTitle))) {
                    fullTitle = `Chapter ${fullTitle}`;
                }

                return { url, title: fullTitle, number: chapterNumber };
            }).reverse();
        });

        console.log(`[SYNC] Scraper found ${chapterRows.length} total chapters.`);

        for (const chap of chapterRows) {
            if (await checkExists(chap.number)) continue;
            yield chap;
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