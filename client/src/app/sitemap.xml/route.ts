import { absoluteUrl } from '@/lib/seo';
import { AUTHORS_PER_SITEMAP, fetchAuthorSitemapTotal, sitemapXmlResponse, toSitemapIndexXml } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

/** Sitemap index at /sitemap.xml — lists core + author chunk sitemaps. */
export async function GET(): Promise<Response> {
  let authorTotal = 0;
  try {
    authorTotal = await fetchAuthorSitemapTotal();
  } catch {
    authorTotal = 0;
  }

  const authorChunks = authorTotal > 0 ? Math.ceil(authorTotal / AUTHORS_PER_SITEMAP) : 0;
  const locs = [absoluteUrl('/sitemaps/core.xml'), ...Array.from({ length: authorChunks }, (_, i) => absoluteUrl(`/sitemaps/authors-${i}.xml`))];

  return sitemapXmlResponse(toSitemapIndexXml(locs));
}
