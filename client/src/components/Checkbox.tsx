'use client';
import { useMemo, useState } from 'react';
import DropdownContainer from "@/components/DropdownContainer";
import { SearchIcon } from 'lucide-react';

type DropdownOption = string | { label: string; value: string };

export default function MultiDropdown({
    title,
    options,
    size,
    onChange,
    label,
    initialValue,
    showSearch = false,
    searchPlaceholder = 'Search...',
    sortAlphabetically = false,
}: {
    title?: string;
    label?: string;
    options?: DropdownOption[];
    size?: string;
    onChange: (vals: string[]) => void;
    initialValue?: string[];
    showSearch?: boolean;
    searchPlaceholder?: string;
    sortAlphabetically?: boolean;
}) {
    const [selectedValues, setSelectedValues] = useState<string[]>(initialValue || []);
    const [query, setQuery] = useState('');

    const normalizedOptions = useMemo(() => {
        if (!options) return [];
        return options.map((opt): { label: string; value: string } => ({
            label: typeof opt === 'string' ? opt : opt.label,
            value: typeof opt === 'string' ? opt : opt.value,
        }));
    }, [options]);

    const filteredAndSortedOptions = useMemo(() => {
        let list = normalizedOptions;
        const trimmed = query.trim().toLowerCase();
        if (trimmed) {
            list = list.filter((opt) => opt.label.toLowerCase().includes(trimmed));
        }
        if (sortAlphabetically) {
            list = [...list].sort((a, b) => a.label.localeCompare(b.label));
        }
        return list;
    }, [normalizedOptions, query, sortAlphabetically]);

    const toggle = (val: string) => {
        const next = selectedValues.includes(val) ? selectedValues.filter(i => i !== val) : [...selectedValues, val];
        setSelectedValues(next);
        onChange(next);
    };

    const getDisplayLabel = () => {
        if (selectedValues.length === 0) return label || 'Select options';

        const firstSelected = normalizedOptions.find((opt) => opt.value === selectedValues[0]);
        const firstLabel = firstSelected?.label ?? selectedValues[0];

        if (selectedValues.length === 1) return firstLabel;
        return `${firstLabel} +${selectedValues.length - 1}`;
    };

    const displayLabel = getDisplayLabel();

    return (
        <DropdownContainer title={title} size={size} selectedLabel={displayLabel}>
            {() => (
                <div className="space-y-2">
                    {showSearch && (
                        <div className="relative">
                            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted pointer-events-none" />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full bg-background border border-borders text-primary rounded-md px-3 py-1 pl-8 text-sm outline-none transition-all focus:ring-2 focus:ring-accent"
                            />
                        </div>
                    )}
                    <div className={showSearch ? 'max-h-44 overflow-y-auto' : ''}>
                        {filteredAndSortedOptions.length === 0 && (
                            <div className="px-2 py-1.5 text-sm text-muted">No options found.</div>
                        )}
                        {filteredAndSortedOptions.map((option) => (
                            <label
                                key={option.value}
                                className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer group min-w-0"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedValues.includes(option.value)}
                                    onChange={() => toggle(option.value)}
                                    className="w-4 h-4 shrink-0 rounded border-borders bg-gray-700 text-blue-500 focus:ring-blue-500"
                                />
                                <span className="text-sm text-primary group-hover:text-gray-300 transition-colors min-w-0 wrap-break-word">
                                    {option.label}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </DropdownContainer>
    );
}