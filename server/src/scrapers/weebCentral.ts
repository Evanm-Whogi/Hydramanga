import { chromium, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export async function* scrapeWeebCentral(mangaName: string, checkExists: (num: string) => Promise<boolean>) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        const searchUrl = `https://weebcentral.com/search?text=${encodeURIComponent(mangaName)}&sort=Best+Match&order=Descending&official=Any&anime=Any&adult=Any&display_mode=Full+Display`;
        console.log(`[NAV] Going to Search: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle' });

        // await page.screenshot({ path: `debug_1_search_results.png` });

        const mangaLink = await page.evaluate((targetName) => {
            // 1. Get all links that point to a series
            const anchors = Array.from(document.querySelectorAll('a[href*="/series/"]'));
            const search = targetName.toLowerCase();
            const match = anchors.find(a => {
                // Check text content (e.g., "Frieren - Beyond Journey's End")
                const text = a.textContent?.trim().toLowerCase() || "";
                
                // Check image alt tags inside the link (very reliable on WeebCentral)
                const imgAlt = a.querySelector('img')?.getAttribute('alt')?.toLowerCase() || "";
                
                // Check the URL slug itself (e.g., "sousou-no-frieren")
                const urlSlug = a.getAttribute('href')?.toLowerCase() || "";

                return text.includes(search) || 
                    search.includes(text) || 
                    imgAlt.includes(search) || 
                    urlSlug.includes(search.replace(/\s+/g, '-'));
            });

            if (match) {
                return { href: (match as HTMLAnchorElement).href, title: match.textContent?.trim() };
            }

            // DEBUG: If no match, return what was found to the console
            return { 
                error: "No match", 
                found: anchors.map(a => ({
                    text: a.textContent?.trim(),
                    url: a.getAttribute('href')
                })).slice(0, 3) 
            };
        }, mangaName);

        if (!mangaLink || 'error' in mangaLink) {
            console.error(`[ERR] Could not find manga link for "${mangaName}". titles found:`, (mangaLink as any)?.titlesFound);
            return;
        }

        console.log(`[NAV] Found Series Page: ${mangaLink.href} (${mangaLink.title})`);
        await page.goto(mangaLink.href, { waitUntil: 'domcontentloaded' });

        // await page.screenshot({ path: `debug_2_series_page.png` });

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

                // FIX: If it's a Prologue, offset it so it doesn't clash with Chapter 1, 2, etc.
                if (fullTitle.toLowerCase().includes('prologue')) {
                    // Converts "Prologue 1" to "0.1", "Prologue 12" to "0.12"
                    chapterNumber = `0.${chapterNumber}`;
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
        await browser.close();
    }
}

export async function downloadChapterImagesStandalone(url: string, mangaName: string, folderName: string) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    try {
       await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForSelector('img[alt*="Page"]', { timeout: 15000 });
        await page.evaluate(() => window.scrollBy(0, 500));

        // await page.screenshot({ path: `debug_chapter_${folderName.replace(/\s+/g, '_')}.png` });

        // 1. Try Primary Selector
        let finalImages = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img.maw-w-full'))
                .map(img => img.getAttribute('data-src') || img.getAttribute('src'))
                .filter((src): src is string => !!src && (src.includes('planeptune.us') || src.includes('googleusercontent')));
        });

        // 2. Try Fallback if primary failed
        if (finalImages.length === 0) {
            finalImages = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('img[alt*="Page"]'))
                    .map(img => img.getAttribute('src'))
                    .filter((src): src is string => !!src && src.startsWith('http'));
            });
        }

        // 3. LOG THE RESULT (Moved outside the IF blocks)
        console.log(`[WORKER] Found ${finalImages.length} images for ${folderName}`);

        if (finalImages.length === 0) {
            throw new Error(`No images found at ${url}`);
        }

        return await downloadImages(finalImages, mangaName, folderName, url);
    } finally {
        await browser.close();
    }
}

async function downloadImages(images: string[], mangaName: string, folderName: string, referer: string) {
    const dir = path.join(process.cwd(), mangaName, folderName);
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
            // If it still 403s, we might need to use page.request from Playwright instead of Axios
            throw err; 
        }
    }
    return dir;
}