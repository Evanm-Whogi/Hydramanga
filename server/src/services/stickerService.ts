import { db, schema } from '@/db/index';
import { asc, eq } from 'drizzle-orm';
import { isAllowedImageUrl } from '@/lib/contentImages';

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
    if (!isAllowedImageUrl(imageUrl)) throw new Error('Image URL must be a site path like /stickers/name.png or http(s) ending in a supported image extension');
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
      if (!isAllowedImageUrl(imageUrl)) throw new Error('Image URL must be a site path like /stickers/name.png or http(s) ending in a supported image extension');
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
};
