"use client";

import { memo } from "react";
import { FILTER_OPTIONS } from "@/constants/filters";
import { LIST_SORT_OPTIONS } from "@/services/curatedListService";
import MultiDropdown from "@/components/Checkbox";
import SingleDropdown from "@/components/Dropdown";
import SearchBar from "@/components/SearchBar";

interface ListsFiltersProps {
  filters: { search: string; genres: string[]; sort: string };
  onFilterChange: (filters: Partial<{ search: string; genres: string[]; sort: string }>) => void;
  params?: { search?: string; genres?: string; sort?: string };
}

function ListsFilters({ filters, onFilterChange, params }: ListsFiltersProps) {
  return (
    <section id="lists-filters" className="py-8">
      <div className="">
        <div className="flex flex-col gap-2 md:gap-3 w-full">
          <div className="flex-1 min-w-50">
            <SearchBar onChange={(val) => onFilterChange({ search: val })} initialValue={params?.search ?? filters.search} size="w-full" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-6">
            <MultiDropdown label="All genres" options={FILTER_OPTIONS.genres as any} onChange={(val) => onFilterChange({ genres: val })} initialValue={params?.genres?.split(',').filter(Boolean) ?? filters.genres} size="w-full" showSearch searchPlaceholder="Search genres..." sortAlphabetically />
            <SingleDropdown options={LIST_SORT_OPTIONS as any} onChange={(val) => onFilterChange({ sort: val })} initialValue={params?.sort ?? filters.sort} size="w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(ListsFilters);
