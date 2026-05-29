import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProfilePage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (value !== undefined) qs.set(key, value);
  }
  const query = qs.toString();
  redirect(`/users/me${query ? `?${query}` : ""}`);
}
