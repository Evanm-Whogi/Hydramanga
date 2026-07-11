import { buildAuthorSitemap, buildCoreSitemap, sitemapXmlResponse, toUrlsetXml } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

type RouteParams = { params: Promise<{ id: string }> };

/** Child sitemaps: /sitemaps/core.xml, /sitemaps/authors-0.xml, … */
export async function GET(_request: Request, context: RouteParams): Promise<Response> {
  const { id } = await context.params;
  let entries;

  if (id === 'core.xml' || id === 'core') {
    entries = await buildCoreSitemap();
  } else {
    const match = /^(?:authors-)(\d+)(?:\.xml)?$/.exec(id);
    if (!match) {
      return new Response('Not found', { status: 404 });
    }
    entries = await buildAuthorSitemap(Number(match[1]));
  }

  return sitemapXmlResponse(toUrlsetXml(entries));
}
