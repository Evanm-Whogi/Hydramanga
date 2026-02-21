"use client";

import { useMemo, useState } from "react";
import DropdownContainer from "@/components/DropdownContainer";
import { SearchIcon } from "lucide-react";

interface TagDropdownProps {
    title?: string;
    label?: string;
    options: string[];
    size?: string;
    onChange: (vals: string[]) => void;
    initialValue?: string[];
}

export default function TagDropdown({title, label = "All tags", options, size, onChange, initialValue = [],}: TagDropdownProps) {
    const [selectedValues, setSelectedValues] = useState<string[]>(initialValue);
    const [query, setQuery] = useState("");

    const filteredOptions = useMemo(() => {
        const trimmed = query.trim().toLowerCase();
        if (!trimmed) return options;
        return options.filter((tag) => tag.toLowerCase().includes(trimmed));
    }, [options, query]);

    const toggle = (val: string) => {
        const next = selectedValues.includes(val)
            ? selectedValues.filter((item) => item !== val)
            : [...selectedValues, val];
        setSelectedValues(next);
        onChange(next);
    };

    const getDisplayLabel = () => {
        if (selectedValues.length === 0) return label;
        const first = selectedValues[0];
        if (selectedValues.length === 1) return first;
        return `${first} +${selectedValues.length - 1}`;
    };

    return (
        <DropdownContainer title={title} size={size} selectedLabel={getDisplayLabel()}>
            {() => (
                <div className="space-y-2">
                    <div className="relative">
                        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted pointer-events-none" />
                        <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tags..." className="w-full bg-background border border-borders text-primary rounded-md px-3 py-1 pl-8 text-sm outline-none transition-all focus:ring-2 focus:ring-accent"/>
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                        {filteredOptions.length === 0 && (
                            <div className="px-2 py-1.5 text-sm text-muted">No tags found.</div>
                        )}
                        {filteredOptions.map((tag) => (
                            <label key={tag} className="flex items-center px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer space-x-3 group">
                                <input type="checkbox" checked={selectedValues.includes(tag)} onChange={() => toggle(tag)} className="w-4 h-4 rounded border-borders bg-gray-700 text-blue-500 focus:ring-blue-500"/>
                                <span className="text-sm text-primary group-hover:text-gray-300 transition-colors">{tag}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </DropdownContainer>
    );
}
