import axios from 'axios';
import logger from '@/services/loggerService';

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
const SITE_NAME = process.env.PUBLIC_NAME || 'HydraManga';
const DISCORD_PUBLIC_WEBHOOK_URL = process.env.DISCORD_PUBLIC_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
const DISCORD_ADMIN_WEBHOOK_URL = process.env.DISCORD_ADMIN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
const FOOTER_TEXT = SITE_NAME;

const COLORS = {
    brand: 0x5865f2,
    success: 0x57f287,
    info: 0x3498db,
    warning: 0xfee75c,
    error: 0xed4245,
    purple: 0x9b59b6,
    teal: 0x1abc9c,
    muted: 0x95a5a6,
} as const;

type WebhookChannel = 'admin' | 'public';

interface EmbedField {
    name: string;
    value: string;
    inline?: boolean;
}

interface DiscordEmbed {
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: EmbedField[];
    timestamp?: string;
    thumbnail?: { url: string };
    footer?: { text: string };
}

const truncate = (text: string, max: number) =>text.length <= max ? text : `${text.slice(0, max - 3)}...`;
const mangaUrl = (seriesId: number) => `${PUBLIC_APP_URL}/manga/${seriesId}`;

const buildEmbed = (options: {title: string; description?: string; url?: string; color: number; fields?: EmbedField[]; thumbnailUrl?: string}): DiscordEmbed => ({
    title: truncate(options.title, 256),
    description: options.description ? truncate(options.description, 4096) : undefined,
    url: options.url,
    color: options.color,
    timestamp: new Date().toISOString(),
    footer: { text: FOOTER_TEXT },
    ...(options.thumbnailUrl && { thumbnail: { url: options.thumbnailUrl } }),
    ...(options.fields?.length && {
        fields: options.fields.map((f) => ({
            ...f,
            name: truncate(f.name, 256),
            value: truncate(f.value, 1024),
        })),
    }),
});

const getWebhookUrl = (channel: WebhookChannel): string | undefined => channel === 'public' ? DISCORD_PUBLIC_WEBHOOK_URL : DISCORD_ADMIN_WEBHOOK_URL;
const isEnabled = () => process.env.ENABLE_DISCORD_NOTIFICATIONS === 'true';

async function sendEmbed(channel: WebhookChannel, embed: DiscordEmbed) {
    if (!isEnabled()) return logger.debug(`Discord notifications disabled, skipping ${channel} embed`);

    const webhookUrl = getWebhookUrl(channel);
    if (!webhookUrl) return logger.warn(`Discord ${channel} webhook URL is not configured`);
    
    const username = channel === 'public' ? `${SITE_NAME} Updates` : `${SITE_NAME} Admin`;

    try {
        await axios.post(webhookUrl, { embeds: [embed], username });
        logger.info(`Discord ${channel} embed sent: ${embed.title}`);
    } catch (error) {
        logger.error(`Error sending Discord ${channel} embed:`, error);
    }
}

export const discordService = {
    // ─── Public channel ───────────────────────────────────────────────────────

    async notifyMangaImported(mangaTitle: string, seriesId: number, chapterCount: number, chapterRange: string, coverUrl?: string) {
        await sendEmbed('public', buildEmbed({
                title: 'New Manga Available',
                description: `**${mangaTitle}** is now on ${SITE_NAME}.`,
                url: mangaUrl(seriesId),
                color: COLORS.success,
                thumbnailUrl: coverUrl,
                fields: [
                    { name: 'Chapters', value: chapterRange, inline: true },
                    { name: 'Count', value: `${chapterCount} chapter${chapterCount !== 1 ? 's' : ''}`, inline: true },
                ],
            })
        );
    },

    async notifyChaptersAdded(mangaTitle: string, seriesId: number, chapterCount: number, chapterRange: string, coverUrl?: string) {
        await sendEmbed('public', buildEmbed({
                title: 'New Chapters',
                description: `**${mangaTitle}** has new chapters.`,
                url: mangaUrl(seriesId),
                color: COLORS.purple,
                thumbnailUrl: coverUrl,
                fields: [
                    { name: 'Chapters', value: chapterRange, inline: true },
                    { name: 'Count', value: `${chapterCount} new`, inline: true },
                ],
            })
        );
    },

    // ─── Admin channel ────────────────────────────────────────────────────────

    async notifyImportRequest(userName: string, requestedTitle: string, requestedUrl: string | null, notes: string | null, requestId: number, seriesId: number | null) {
        const mangaLink = seriesId != null ? `[${requestedTitle}](${mangaUrl(seriesId)})` : requestedTitle;

        await sendEmbed('admin', buildEmbed({
                title: 'New Import Request',
                description: `${userName} submitted a request for **${mangaLink}**.`,
                url: `${PUBLIC_APP_URL}/admin/imports`,
                color: COLORS.info,
                fields: [
                    { name: 'Request ID', value: `#${requestId}`, inline: true },
                    ...(seriesId != null
                        ? [{ name: 'Series ID', value: String(seriesId), inline: true }]
                        : []),
                    { name: 'Source URL', value: requestedUrl || '_None provided_', inline: false },
                    ...(notes ? [{ name: 'User Notes', value: notes, inline: false }] : []),
                ],
            })
        );
    },

    async notifyUserSignup(username: string, userId: string) {
        await sendEmbed('admin', buildEmbed({
                title: 'New User',
                description: `**${username}** just signed up.`,
                url: `${PUBLIC_APP_URL}/admin/users`,
                color: COLORS.teal,
                fields: [{ name: 'User ID', value: userId, inline: true }],
            })
        );
    },

    async notifyComment(username: string, seriesId: number, mangaTitle: string, content: string, commentId: number, isReply: boolean) {
        const preview = truncate(content.replace(/\s+/g, ' ').trim(), 300);

        await sendEmbed('admin', buildEmbed({
                title: isReply ? 'New Comment Reply' : 'New Comment',
                description: `**${username}** on [**${mangaTitle}**](${mangaUrl(seriesId)}):\n> ${preview}`,
                url: mangaUrl(seriesId),
                color: COLORS.brand,
                fields: [
                    { name: 'Comment ID', value: String(commentId), inline: true },
                    { name: 'Type', value: isReply ? 'Reply' : 'Top-level', inline: true },
                ],
            })
        );
    },

    async notifyBoardThread(username: string, postId: number, title: string, content: string) {
        const preview = truncate(content.replace(/\s+/g, ' ').trim(), 300);

        await sendEmbed('admin', buildEmbed({
                title: 'New Board Thread',
                description: `**${username}** posted [**${title}**](${PUBLIC_APP_URL}/forum/${postId}):\n> ${preview}`,
                url: `${PUBLIC_APP_URL}/forum/${postId}`,
                color: COLORS.brand,
                fields: [{ name: 'Post ID', value: String(postId), inline: true }],
            })
        );
    },

    async notifyImportStarted(fileName: string) {
        await sendEmbed('admin', buildEmbed({
                title: 'Metadata Import Started',
                description: `Importing catalog from \`${fileName}\``,
                color: COLORS.info,
            })
        );
    },

    async notifyImportCompleted(fileName: string, stats: { inserted: number; updated: number; duration: string }) {
        await sendEmbed('admin', buildEmbed({
                title: 'Metadata Import Completed',
                description: `Finished importing from \`${fileName}\``,
                color: COLORS.success,
                fields: [
                    { name: 'New Series', value: stats.inserted.toLocaleString(), inline: true },
                    { name: 'Updated', value: stats.updated.toLocaleString(), inline: true },
                    { name: 'Duration', value: stats.duration, inline: true },
                ],
            })
        );
    },

    async notifyImportFailed(fileName: string, error: string) {
        await sendEmbed('admin', buildEmbed({
                title: 'Metadata Import Failed',
                description: `Import from \`${fileName}\` failed.`,
                color: COLORS.error,
                fields: [{ name: 'Error', value: `\`\`\`${truncate(error, 900)}\`\`\`` }],
            })
        );
    },

    async notifyScanCompleted(mangaTitle: string, seriesId: number, foundCount: number, isFirstScan: boolean, coverUrl?: string) {
        if (foundCount <= 0) return;

        const scanType = isFirstScan ? 'First scan' : 'Rescan';

        await sendEmbed('admin', buildEmbed({
                title: 'Chapter Scan Completed',
                description: `**${mangaTitle}** — found **${foundCount}** new chapter${foundCount !== 1 ? 's' : ''}.`,
                url: mangaUrl(seriesId),
                color: COLORS.info,
                thumbnailUrl: coverUrl,
                fields: [
                    { name: 'Scan Type', value: scanType, inline: true },
                    { name: 'New Chapters', value: String(foundCount), inline: true },
                    { name: 'Series ID', value: String(seriesId), inline: true },
                ],
            })
        );
    },

    async notifyScraperFailed(mangaTitle: string, seriesId: number, foundTitles: Array<{ text: string; url: string }>, coverUrl?: string) {
        const suggestions =
            foundTitles.length > 0
                ? foundTitles
                      .slice(0, 3)
                      .map((t) => `• ${t.text || 'Unknown'}`)
                      .join('\n')
                : '_No alternative matches found_';

        await sendEmbed('admin', buildEmbed({
                title: 'Chapter Scan Failed',
                description: `Could not scan **${mangaTitle}** after all retries.`,
                url: mangaUrl(seriesId),
                color: COLORS.warning,
                thumbnailUrl: coverUrl,
                fields: [
                    { name: 'Series ID', value: String(seriesId), inline: true },
                    { name: 'Possible Matches', value: suggestions },
                ],
            })
        );
    },
};
