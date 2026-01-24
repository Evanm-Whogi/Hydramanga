'use client';

import { useState } from 'react';
import ListComponent from './ListComponent';
import ListManagerModal from './ListManagerModal';
import { fetchAllLists, ListsData } from '@/services/listService';

interface ListsPageClientProps {
  initialData: ListsData;
}

export default function ListsPageClient({ initialData }: ListsPageClientProps) {
  const [listsData, setListsData] = useState<ListsData>(initialData || { lists: [] });
  const [showManager, setShowManager] = useState(false);

  const handleUpdate = async () => {
    try {
      const updated = await fetchAllLists();
      setListsData(updated || { lists: [] });
    } catch (error) {
      console.error('Failed to refresh lists:', error);
    }
  };

  return (
    <div className="container mx-auto">
      <div className="flex justify-end mt-6">
        <button onClick={() => setShowManager(!showManager)} className="bg-foreground px-4 py-2 rounded-md border border-background hover:bg-foreground/50 transition-colors hover:cursor-pointer">
          {showManager ? 'Hide' : 'Manage Lists'}
        </button>
      </div>

      <ListManagerModal
        isOpen={showManager}
        onClose={() => setShowManager(false)}
        lists={listsData?.lists || []}
        onUpdate={handleUpdate}
      />

      <ListComponent lists={listsData} onUpdate={handleUpdate} />
    </div>
  );
}
