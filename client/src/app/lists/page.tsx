import { Suspense } from 'react';
import type { Metadata } from "next";
import ListsPageClient from '@/app/lists/components/ListsPageClient';
import { fetchAllLists } from '@/services/listService';
import PageHeader from '@/components/PageHeader';
import { buildPageMetadata } from '@/lib/seo';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'My Lists',
  description: 'Manage your personal manga reading lists on HydraManga.',
  path: '/lists',
  noIndex: true,
});

export default async function ListsPage() {

  const listsData = await fetchAllLists();

    return (
      <>
        <PageHeader title="My Lists" description="Manage your personal manga lists with ease." />
        <ListsPageClient initialData={listsData} />
      </>
    );

}