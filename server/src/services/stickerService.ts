import fs from 'fs/promises';
import path from 'path';
import { db, schema } from '@/db/index';
import { asc, eq } from 'drizzle-orm';
import { CONTENT_LIMITS } from '@/lib/securityLimits';
import { buildStickerImageUrl, isAllowedStickerImageUrl, listStickerFilenamesFromDisk, resolveSafeStickerFilePath } from '@/lib/stickerImagePath';

export const stickerService = {
  async listPublic() {
    const rows = await db
      .select({
        id: schema.contentStickers.id,
        label: schema.contentStickers.label,
        imageUrl: schema.contentStickers.imageUrl,
      })
      .from(schema.contentStickers)
      .where(eq(schema.contentStickers.isActive, true))
      .orderBy(asc(schema.contentStickers.sortOrder), asc(schema.contentStickers.id));
    return rows;
  },

  async listAdmin() {
    return db
      .select()
      .from(schema.contentStickers)
      .orderBy(asc(schema.contentStickers.sortOrder), asc(schema.contentStickers.id));
  },

  async create(data: { label?: string | null; imageUrl: string; sortOrder?: number; isActive?: boolean }) {
    const imageUrl = data.imageUrl.trim();
    if (!isAllowedStickerImageUrl(imageUrl)) {
      throw new Error('Image URL must be a site path like /media/stickers/name.png');
    }
    const [row] = await db
      .insert(schema.contentStickers)
      .values({
        label: data.label?.trim() || null,
        imageUrl,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      })
      .returning();
    return row;
  },

  async update(id: number, data: { label?: string | null; imageUrl?: string; sortOrder?: number; isActive?: boolean }) {
    const existing = await db.query.contentStickers.findFirst({ where: eq(schema.contentStickers.id, id) });
    if (!existing) throw new Error('Sticker not found');
    const patch: Partial<typeof schema.contentStickers.$inferInsert> = { updatedAt: new Date() };
    if (data.label !== undefined) patch.label = data.label?.trim() || null;
    if (data.imageUrl !== undefined) {
      const imageUrl = data.imageUrl.trim();
      if (!isAllowedStickerImageUrl(imageUrl)) {
        throw new Error('Image URL must be a site path like /media/stickers/name.png');
      }
      patch.imageUrl = imageUrl;
    }
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    const [row] = await db.update(schema.contentStickers).set(patch).where(eq(schema.contentStickers.id, id)).returning();
    return row;
  },

  async remove(id: number) {
    const existing = await db.query.contentStickers.findFirst({ where: eq(schema.contentStickers.id, id) });
    if (!existing) throw new Error('Sticker not found');
    await db.delete(schema.contentStickers).where(eq(schema.contentStickers.id, id));
  },

  async scanAndImportFromDisk(): Promise<{ added: number; skipped: number; addedFiles: string[] }> {
    const filenames = await listStickerFilenamesFromDisk();
    const existing = await this.listAdmin();
    const existingUrls = new Set(existing.map((row) => row.imageUrl));
    let nextSort = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

    let added = 0;
    let skipped = 0;
    const addedFiles: string[] = [];

    for (const filename of filenames) {
      const imageUrl = buildStickerImageUrl(filename);
      if (!imageUrl) {
        skipped++;
        continue;
      }
      if (existingUrls.has(imageUrl)) {
        skipped++;
        continue;
      }

      const filePath = resolveSafeStickerFilePath(imageUrl);
      if (!filePath) {
        skipped++;
        continue;
      }

      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        skipped++;
        continue;
      }
      if (!stat.isFile() || stat.size > CONTENT_LIMITS.stickerMaxFileBytes) {
        skipped++;
        continue;
      }

      const label = path.basename(filename, path.extname(filename));
      await this.create({ label, imageUrl, sortOrder: nextSort++, isActive: true });
      existingUrls.add(imageUrl);
      addedFiles.push(filename);
      added++;
    }

    return { added, skipped, addedFiles };
  },
};
