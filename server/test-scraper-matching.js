#!/usr/bin/env node

/**
 * Scraper Title Matching Test Script (CommonJS)
 * 
 * Tests whether each scraper can find a manga by its titles (primary, romanized, native)
 * Does NOT download or scrape chapters - only tests the title matching logic
 * 
 * Usage:
 *   node test-scraper-matching.js <mangaId>
 * 
 * Example:
 *   node test-scraper-matching.js 1692
 */

require('tsconfig-paths/register');

const { db } = require('@/db');
const { series } = require('@/db/schema');
const { eq } = require('drizzle-orm');
const { WeebCentralScraper } = require('@/scrapers/implementations/WeebCentralScraper');
const { NHentaiScraper } = require('@/scrapers/implementations/nHentaiScraper');
const { MangaDexScraper } = require('@/scrapers/implementations/MangaDexScraper');
const { MangaTaroScraper } = require('@/scrapers/implementations/MangaTaroScraper');
const { ToonilyScraper } = require('@/scrapers/implementations/ToonilyScraper');
const { AtsuMoeScraper } = require('@/scrapers/implementations/AtsuMoeScraper');
const { AsuraComicScraper } = require('@/scrapers/implementations/AsuraComicScraper');
const logger = require('@/services/loggerService').default;
const dotenv = require('dotenv');
dotenv.config();

function extractSecondaryTitleStrings(secondaryTitles) {
    if (!secondaryTitles) return [];

    let parsed = secondaryTitles;
    if (typeof secondaryTitles === 'string') {
        try {
            parsed = JSON.parse(secondaryTitles);
        } catch {
            parsed = secondaryTitles;
        }
    }

    const titles = [];

    const visit = (value) => {
        if (!value) return;

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) titles.push(trimmed);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }

        if (typeof value === 'object') {
            if (typeof value.title === 'string') {
                const trimmed = value.title.trim();
                if (trimmed) titles.push(trimmed);
                return;
            }

            Object.values(value).forEach(visit);
        }
    };

    visit(parsed);

    const seen = new Set();
    return titles.filter((title) => {
        const key = title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function testScraperMatching(mangaId) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing Scraper Title Matching for Manga ID: ${mangaId}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
        // Fetch manga from database
        const manga = await db
            .select({
                id: series.id,
                title: series.title,
                nativeTitle: series.nativeTitle,
                romanizedTitle: series.romanizedTitle,
                secondaryTitles: series.secondaryTitles,
                genres: series.genres,
                genresV2: series.genresV2,
            })
            .from(series)
            .where(eq(series.id, mangaId))
            .limit(1);

        if (!manga || manga.length === 0) {
            console.error(`❌ Manga with ID ${mangaId} not found in database`);
            process.exit(1);
        }

        const m = manga[0];

        console.log(`📚 Manga Information:`);
        console.log(`   ID: ${m.id}`);
        console.log(`   Primary Title: ${m.title}`);
        console.log(`   Romanized Title: ${m.romanizedTitle || '(none)'}`);
        console.log(`   Native Title: ${m.nativeTitle || '(none)'}`);

        const secondaryTitles = extractSecondaryTitleStrings(m.secondaryTitles);
        console.log(`   Secondary Titles: ${secondaryTitles.length ? secondaryTitles.join(' | ') : '(none)'}\n`);

        // Test each scraper
        const results = [];


        const scraperPriorities = [
            { name: 'WeebCentral', priority: Number(process.env.WEEB_CENTRAL_PRIORITY) || 1 },
            { name: 'AtsuMoe', priority: Number(process.env.ATSU_MOE_PRIORITY) || 2 },
            { name: 'AsuraComic', priority: Number(process.env.ASURA_COMIC_PRIORITY) || 2 },
            { name: 'MangaTaro', priority: Number(process.env.MANGATARO_PRIORITY) || 2 },
            { name: 'Toonily', priority: Number(process.env.TOONILY_PRIORITY) || 5 },
            { name: 'MangaDex', priority: Number(process.env.MANGADEX_PRIORITY) || 4 },
            { name: 'nHentai', priority: Number(process.env.NHENTAI_PRIORITY) || 3 },
        ];

        console.log(`Scraper Priorities:`);
        scraperPriorities.sort((a, b) => a.priority - b.priority).forEach(s => {
            console.log(`   ${s.name}: Priority ${s.priority}`);
        });


        console.log(`\n${'─'.repeat(80)}`);
        console.log(`Testing Scrapers...`);
        console.log(`${'─'.repeat(80)}`);

        // Test WeebCentral
        try {
            console.log(`\n🔍 Testing WeebCentral...`);
            const scraper = new WeebCentralScraper();
            const result = await scraper.findBestMatch(m.title, {
                nativeTitle: m.nativeTitle,
                romanizedTitle: m.romanizedTitle,
                secondaryTitles,
            });
            
            if (result) {
                console.log(`   ✅ FOUND: "${result.title}"`);
                console.log(`      URL: ${result.href}`);
                console.log(`      Score: ${result.score}`);
                results.push({
                    scraper: 'WeebCentral',
                    found: true,
                    title: result.title,
                    url: result.href,
                    score: result.score
                });
            } else {
                console.log(`   ❌ NOT FOUND`);
                results.push({
                    scraper: 'WeebCentral',
                    found: false
                });
            }
        } catch (err) {
            console.log(`   ❌ ERROR: ${err.message}`);
            results.push({
                scraper: 'WeebCentral',
                found: false,
                error: err.message
            });
        }

        // Test AtsuMoe
        try {
            console.log(`\n🔍 Testing AtsuMoe...`);
            const scraper = new AtsuMoeScraper();
            const result = await scraper.findBestMatch(m.title, {
                nativeTitle: m.nativeTitle,
                romanizedTitle: m.romanizedTitle,
                secondaryTitles,
            });
            
            if (result) {
                console.log(`   ✅ FOUND: "${result.title}"`);
                console.log(`      URL: ${result.href}`);
                console.log(`      Score: ${result.score}`);
                results.push({
                    scraper: 'AtsuMoe',
                    found: true,
                    title: result.title,
                    url: result.href,
                    score: result.score
                });
            } else {
                console.log(`   ❌ NOT FOUND`);
                results.push({
                    scraper: 'AtsuMoe',
                    found: false
                });
            }
        } catch (err) {
            console.log(`   ❌ ERROR: ${err.message}`);
            results.push({
                scraper: 'AtsuMoe',
                found: false,
                error: err.message
            });
        }

        // Test MangaTaro
        try {
            console.log(`\n🔍 Testing MangaTaro...`);
            const scraper = new MangaTaroScraper();
            const result = await scraper.findBestMatch(m.title, {
                nativeTitle: m.nativeTitle,
                romanizedTitle: m.romanizedTitle,
                secondaryTitles,
            });
            
            if (result) {
                console.log(`   ✅ FOUND: "${result.title}"`);
                console.log(`      URL: ${result.href}`);
                console.log(`      Score: ${result.score}`);
                results.push({
                    scraper: 'MangaTaro',
                    found: true,
                    title: result.title,
                    url: result.href,
                    score: result.score
                });
            } else {
                console.log(`   ❌ NOT FOUND`);
                results.push({
                    scraper: 'MangaTaro',
                    found: false
                });
            }
        } catch (err) {
            console.log(`   ❌ ERROR: ${err.message}`);
            results.push({
                scraper: 'MangaTaro',
                found: false,
                error: err.message
            });
        }

        // Test Toonily
        try {
            console.log(`\n🔍 Testing Toonily...`);
            const scraper = new ToonilyScraper();
            const result = await scraper.findBestMatch(m.title, {
                nativeTitle: m.nativeTitle,
                romanizedTitle: m.romanizedTitle,
                secondaryTitles,
            });
            
            if (result) {
                console.log(`   ✅ FOUND: "${result.title}"`);
                console.log(`      URL: ${result.href}`);
                console.log(`      Score: ${result.score}`);
                results.push({
                    scraper: 'Toonily',
                    found: true,
                    title: result.title,
                    url: result.href,
                    score: result.score
                });
            } else {
                console.log(`   ❌ NOT FOUND`);
                results.push({
                    scraper: 'Toonily',
                    found: false
                });
            }
        } catch (err) {
            console.log(`   ❌ ERROR: ${err.message}`);
            results.push({
                scraper: 'Toonily',
                found: false,
                error: err.message
            });
        }

        // Test nHentai
        try {
            console.log(`\n🔍 Testing nHentai...`);
            const scraper = new NHentaiScraper();
            const result = await scraper.findBestMatch(m.title, {
                nativeTitle: m.nativeTitle,
                romanizedTitle: m.romanizedTitle,
                secondaryTitles,
            });
            
            if (result) {
                console.log(`   ✅ FOUND: "${result.title}"`);
                console.log(`      URL: ${result.href}`);
                console.log(`      Score: ${result.score}`);
                results.push({
                    scraper: 'nHentai',
                    found: true,
                    title: result.title,
                    url: result.href,
                    score: result.score
                });
            } else {
                console.log(`   ❌ NOT FOUND`);
                results.push({
                    scraper: 'nHentai',
                    found: false
                });
            }
        } catch (err) {
            console.log(`   ❌ ERROR: ${err.message}`);
            results.push({
                scraper: 'nHentai',
                found: false,
                error: err.message
            });
        }

        // Test MangaDex
        // Test AsuraComic
        try {
            console.log(`\n🔍 Testing AsuraComic...`);
            const scraper = new AsuraComicScraper();
            const result = await scraper.findBestMatch(m.title, {
                nativeTitle: m.nativeTitle,
                romanizedTitle: m.romanizedTitle,
                secondaryTitles,
            });
            
            if (result) {
                console.log(`   ✅ FOUND: "${result.title}"`);
                console.log(`      URL: ${result.href}`);
                console.log(`      Score: ${result.score}`);
                results.push({
                    scraper: 'AsuraComic',
                    found: true,
                    title: result.title,
                    url: result.href,
                    score: result.score
                });
            } else {
                console.log(`   ❌ NOT FOUND`);
                results.push({
                    scraper: 'AsuraComic',
                    found: false
                });
            }
        } catch (err) {
            console.log(`   ❌ ERROR: ${err.message}`);
            results.push({
                scraper: 'AsuraComic',
                found: false,
                error: err.message
            });
        }
        try {
            console.log(`\n🔍 Testing MangaDex...`);
            const scraper = new MangaDexScraper();
            const result = await scraper.findBestMatch(m.title, {
                nativeTitle: m.nativeTitle,
                romanizedTitle: m.romanizedTitle,
                secondaryTitles,
            });
            
            if (result) {
                console.log(`   ✅ FOUND: "${result.title}"`);
                console.log(`      URL: ${result.href}`);
                console.log(`      Score: ${result.score}`);
                results.push({
                    scraper: 'MangaDex',
                    found: true,
                    title: result.title,
                    url: result.href,
                    score: result.score
                });
            } else {
                console.log(`   ❌ NOT FOUND`);
                results.push({
                    scraper: 'MangaDex',
                    found: false
                });
            }
        } catch (err) {
            console.log(`   ❌ ERROR: ${err.message}`);
            results.push({
                scraper: 'MangaDex',
                found: false,
                error: err.message
            });
        }

        // Summary
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Summary:`);
        console.log(`${'='.repeat(80)}`);
        
        const found = results.filter(r => r.found).length;
        const notFound = results.filter(r => !r.found && !r.error).length;
        const errors = results.filter(r => r.error).length;

        console.log(`✅ Found: ${found}`);
        console.log(`❌ Not Found: ${notFound}`);
        console.log(`⚠️  Errors: ${errors}`);
        console.log();

        // Show which scraper would be chosen by ScraperManager
        const foundResults = results.filter(r => r.found && r.score !== undefined);
        if (foundResults.length > 0) {
            // Sort by score (highest first), then by priority (if tied)
            const priorities = {
                'WeebCentral': 1,
                'AtsuMoe': 2,
                'AsuraComic': 2,
                'MangaTaro': 2,
                'Toonily': 5,
                'MangaDex': 4,
                'nHentai': 3
            };
            
            const mainSources = ['WeebCentral', 'AtsuMoe', 'AsuraComic', 'MangaTaro', 'Toonily', 'MangaDex'];
            
            // Match ScraperManager's NEW sorting logic with exact match bonus and nHentai deprioritization
            foundResults.sort((a, b) => {
                // FIRST: Check if one is nHentai and other is a main source
                const aIsNHentai = a.scraper === 'nHentai';
                const bIsNHentai = b.scraper === 'nHentai';
                
                if (aIsNHentai !== bIsNHentai) {
                    const mainSource = aIsNHentai ? b : a;
                    const nHentaiMatch = aIsNHentai ? a : b;
                    
                    // If main source has score >= 70, always prefer it
                    if (mainSource.score >= 70) {
                        return aIsNHentai ? 1 : -1; // Prefer main source
                    }
                    
                    // If main source has score 50-69, only pick nHentai if it's 40+ points better
                    if (mainSource.score >= 50) {
                        const scoreDiff = nHentaiMatch.score - mainSource.score;
                        if (scoreDiff < 40) {
                            return aIsNHentai ? 1 : -1; // Prefer main source
                        }
                    }
                }
                
                // SECOND: Exact match bonus - if one is near-perfect (95+)
                const aIsNearPerfect = a.score >= 95;
                const bIsNearPerfect = b.score >= 95;
                
                if (aIsNearPerfect !== bIsNearPerfect) {
                    return aIsNearPerfect ? -1 : 1;
                }
                
                if (aIsNearPerfect && bIsNearPerfect) {
                    const scoreDiff = Math.abs(a.score - b.score);
                    if (scoreDiff > 0) {
                        return b.score - a.score;
                    }
                    return priorities[a.scraper] - priorities[b.scraper];
                }
                
                // THIRD: Standard scoring logic
                const scoreDiff = Math.abs(a.score - b.score);
                if (scoreDiff <= 20) {
                    return priorities[a.scraper] - priorities[b.scraper];
                }
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return priorities[a.scraper] - priorities[b.scraper];
            });

            console.log(`${'='.repeat(80)}`);
            console.log(`🎯 ScraperManager Selection:`);
            console.log(`${'='.repeat(80)}`);
            
            const winner = foundResults[0];
            console.log(`\n✨ WINNER: ${winner.scraper}`);
            console.log(`   Title: "${winner.title}"`);
            console.log(`   URL: ${winner.url}`);
            console.log(`   Score: ${winner.score}`);
            
            if (foundResults.length > 1) {
                console.log(`\n📊 All Candidates (sorted with nHentai deprioritization):`);
                foundResults.forEach((r, i) => {
                    const icon = i === 0 ? '👑' : '  ';
                    console.log(`   ${icon} ${r.scraper.padEnd(15)} Score: ${r.score.toString().padEnd(3)} - "${r.title}"`);
                });
            }
            
            console.log();
        }

        process.exit(0);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Get manga ID from command line arguments
const mangaId = parseInt(process.argv[2]);
if (!mangaId) {
    console.error('Usage: node test-scraper-matching.js <mangaId>');
    console.error('Example: node test-scraper-matching.js 1692');
    process.exit(1);
}

testScraperMatching(mangaId).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
