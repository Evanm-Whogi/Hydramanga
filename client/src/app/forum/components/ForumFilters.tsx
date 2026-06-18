'use client';

import SearchBar from '@/components/SearchBar';
import SingleDropdown from '@/components/Dropdown';
import { FORUM_CATEGORY_OPTIONS, FORUM_SORT_OPTIONS } from '@/constants/forumCategories';

export default function ForumFilters({ q, category, sort, onQChange, onCategoryChange, onSortChange }: {
  q: string;
  category: string;
  sort: string;
  onQChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSortChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4 w-full">
      <div className="flex-1 min-w-0">
        <SearchBar onChange={onQChange} initialValue={q} placeholder="Search forum posts..." size="w-full" />
      </div>
      <div className="w-full sm:w-48">
        <SingleDropdown options={FORUM_CATEGORY_OPTIONS as any} onChange={onCategoryChange} initialValue={category || 'all'} size="w-full" />
      </div>
      <div className="w-full sm:w-40">
        <SingleDropdown options={FORUM_SORT_OPTIONS as any} onChange={onSortChange} initialValue={sort || 'latest'} size="w-full" />
      </div>
    </div>
  );
}
