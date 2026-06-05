import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export type ContentSticker = {
  id: number;
  label: string | null;
  imageUrl: string;
};

export type AdminContentSticker = ContentSticker & {
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function normalizeSticker(raw: Record<string, unknown>): ContentSticker {
  return {
    id: Number(raw.id),
    label: (raw.label as string | null) ?? null,
    imageUrl: String(raw.imageUrl ?? raw.image_url ?? ""),
  };
}

export async function fetchStickers(): Promise<ContentSticker[]> {
  const data = await apiGet("/stickers");
  return (data?.stickers ?? []).map((row: Record<string, unknown>) => normalizeSticker(row)).filter((s: ContentSticker) => s.imageUrl);
}

export async function fetchAdminStickers(): Promise<AdminContentSticker[]> {
  const data = await apiGet("/admin/stickers");
  return data?.stickers ?? [];
}

export async function createAdminSticker(payload: { label?: string; imageUrl: string; sortOrder?: number; isActive?: boolean }) {
  const data = await apiPost("/admin/stickers", payload);
  return data.sticker as AdminContentSticker;
}

export async function updateAdminSticker(id: number, payload: { label?: string; imageUrl?: string; sortOrder?: number; isActive?: boolean }) {
  const data = await apiPatch(`/admin/stickers/${id}`, payload);
  return data.sticker as AdminContentSticker;
}

export async function deleteAdminSticker(id: number) {
  await apiDelete(`/admin/stickers/${id}`);
}
