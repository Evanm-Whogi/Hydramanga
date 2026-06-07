import type { Metadata } from 'next';
import BookmarksPageClient from '@/app/bookmarks/components/BookmarksPageClient';
import PageHeader from '@/components/PageHeader';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'My Bookmarks',
  description: 'Manage your manga reading bookmarks on HydraManga.',
  path: '/bookmarks',
  noIndex: true,
});

export default function BookmarksPage() {
  return (
    <>
      <PageHeader title="My Bookmarks" description="Track what you're reading, planning, and completed." />
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <BookmarksPageClient />
      </div>
    </>
  );
}
