import axios from 'axios';
import logger from '@/services/loggerService';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface EmbedField {
    name: string;
    value: string;
    inline?: boolean;
}

interface DiscordEmbed {
    title: string;
    description: string;
    fields?: EmbedField[];
    color: number;
    timestamp: string;
    thumbnail?: { url: string };
}

const createEmbed = (overrides: Partial<DiscordEmbed>): DiscordEmbed => ({
    color: 0x3498db,
    timestamp: new Date().toISOString(),
    ...overrides,
    title: overrides.title || '',
    description: overrides.description || '',
});

const discordService = {
    async sendEmbed(embed: DiscordEmbed, username = 'MangaScrolls Bot', avatarUrl?: string) {
        if (!DISCORD_WEBHOOK_URL) return logger.warn('Discord webhook URL is not configured.');
        try {
            await axios.post(DISCORD_WEBHOOK_URL, {
                embeds: [embed],
                username,
                avatar_url: avatarUrl,
            });
            logger.info('Discord embed sent successfully.');
        } catch (error) {
            logger.error('Error sending Discord embed:', error);
        }
    },

    // Metadata import notifications
    async notifyImportStarted(fileName: string) {
        await this.sendEmbed(
            createEmbed({
                title: '📦 Metadata Import Started',
                description: `Starting import from \`${fileName}\``,
                color: 0x3498db,
            })
        );
    },

    async notifyImportCompleted(fileName: string, stats: { inserted: number; updated: number; duration: string }) {
        await this.sendEmbed(
            createEmbed({
                title: '✅ Metadata Import Completed',
                description: `Successfully imported from \`${fileName}\``,
                color: 0x2ecc71,
                fields: [
                    { name: 'New Series', value: stats.inserted.toString(), inline: true },
                    { name: 'Updated Series', value: stats.updated.toString(), inline: true },
                    { name: 'Duration', value: stats.duration, inline: true },
                ],
            })
        );
    },

    async notifyImportFailed(fileName: string, error: string) {
        await this.sendEmbed(
            createEmbed({
                title: '❌ Metadata Import Failed',
                description: `Failed to import from \`${fileName}\``,
                fields: [{ name: 'Error', value: `\`\`\`${error.slice(0, 1000)}\`\`\`` }],
                color: 0xe74c3c,
            })
        );
    },

    // Chapter notifications (batched)
    async notifyChaptersAdded(mangaTitle: string, seriesId: number, chapterCount: number, chapterRange: string, coverUrl?: string) {
        await this.sendEmbed(createEmbed({
            title: '📚 New Chapters Added',
            description: `**${mangaTitle}**`,
             color: 0x9b59b6,
            ...(coverUrl && { thumbnail: { url: coverUrl } }),
            fields: [
                { name: 'Chapters', value: chapterRange, inline: true },
                { name: 'Total', value: `${chapterCount} new`, inline: true },
                { name: 'Series ID', value: seriesId.toString(), inline: true },
            ],
        }));
    },

    // Scraper failed to find manga
    async notifyScraperFailed(mangaTitle: string, seriesId: number, foundTitles: Array<{ text: string; url: string }>, coverUrl?: string) {
        await this.sendEmbed(createEmbed({
            title: '⚠️ Scraper Failed',
            description: `Could not find manga: **${mangaTitle}** (ID: ${seriesId})`,
            color: 0xe67e22,
            ...(coverUrl && { thumbnail: { url: coverUrl } }),
            fields: [
                {
                    name: 'Found Instead',
                    value:
                        foundTitles.length > 0
                            ? foundTitles.slice(0, 3).map((t) => `• ${t.text || 'Unknown'}`).join('\n')
                            : 'No results found',
                },
            ],
        }));
    },

    // Manga scan completed
    async notifyScanCompleted(mangaTitle: string, seriesId: number, foundCount: number, coverUrl?: string) {
        const icon = foundCount > 0 ? '🔄' : '⏭️';
        const description =
            foundCount > 0
                ? `Found **${foundCount}** new chapter${foundCount !== 1 ? 's' : ''} for **${mangaTitle}**`
                : `Scan completed for **${mangaTitle}** - No new chapters`;

        await this.sendEmbed(createEmbed({
            title: `${icon} Manga Scan Completed`,
            description,
            fields: [
                { name: 'Series ID', value: seriesId.toString(), inline: true },
                { name: 'New Chapters', value: foundCount.toString(), inline: true },
            ],
            color: foundCount > 0 ? 0x3498db : 0x95a5a6,
            ...(coverUrl && { thumbnail: { url: coverUrl } }),
        }));
    },

    // First time a user views a manga (on-demand scan)
    async notifyFirstMangaScan(mangaTitle: string, seriesId: number, coverUrl?: string) {
        await this.sendEmbed(createEmbed({
            title: '👀 Manga Discovered',
            description: `User is viewing **${mangaTitle}** for the first time. Scanning for chapters...`,
            fields: [
                { name: 'Series ID', value: seriesId.toString(), inline: true },
                { name: 'Type', value: 'On-Demand Scan', inline: true },
            ],
            color: 0xf39c12,
            ...(coverUrl && { thumbnail: { url: coverUrl } }),
        }));
    },

    // Notify when a user signs up
    async notifyUserSignup(username: string, userId: number) {
        await this.sendEmbed(createEmbed({
            title: '🆕 New User Signup',
            description: `A new user has signed up: **${username}** (ID: ${userId})`,
            color: 0x1abc9c,
        }));
    }
};

export { discordService };
