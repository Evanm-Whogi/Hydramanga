import { Suspense } from 'react';
import type { Metadata } from "next";
import ListComponent from './components/ListComponent';
import { fetchAllLists } from '@/services/mangaService';
import PageHeader from '@/components/PageHeader';

export const metadata: Metadata = {
  title: `My Lists - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Manage your personal manga lists with ease.",
  openGraph: {
    title: `My Lists - ${process.env.NEXT_PUBLIC_NAME}`,
    description: "Manage your personal manga lists with ease.",
    type: "website",
  },
};

  export default async function ListsPage() {
    const lists = await fetchAllLists();

  return (
    <>
      <PageHeader title="My Lists" description="Manage your personal manga lists with ease." />
      <ListComponent lists={lists} />
    </>
  );
}