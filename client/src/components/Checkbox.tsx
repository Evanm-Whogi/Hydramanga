'use client'
import { useState } from 'react';
import DropdownContainer from "@/components/DropdownContainer";

// Define a type that accepts either a string OR the new object format
type DropdownOption = string | { label: string; value: string };

export default function MultiDropdown({ title, options, size, onChange, label, initialValue }: { title?: string; label?: string, options?: DropdownOption[]; size?: string; onChange: (vals: string[]) => void; initialValue?: string[] }) {
    const [selectedValues, setSelectedValues] = useState<string[]>(initialValue || []);

    const toggle = (val: string) => {
        const next = selectedValues.includes(val) ? selectedValues.filter(i => i !== val) : [...selectedValues, val];
        setSelectedValues(next);
        onChange(next);
    };

    label ? null : label = selectedValues.length > 0 ? `${selectedValues.length} selected` : 'Select options';

    return (
        <DropdownContainer title={title} size={size} selectedLabel={label}>
            {() => (
                <>
                    {options?.map((option) => {
                        // Determine the label and value based on the type of 'option'
                        const label = typeof option === 'string' ? option : option.label;
                        const value = typeof option === 'string' ? option : option.value;

                        return (
                            <label key={value} className="flex items-center px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer space-x-3 group">
                                <input type="checkbox" checked={selectedValues.includes(value)} onChange={() => toggle(value)} className="w-4 h-4 rounded border-borders bg-gray-700 text-blue-500 focus:ring-blue-500" />
                                <span className="text-sm text-primary group-hover:text-gray-300 transition-colors">{label}</span>
                            </label>
                        );
                    })}
                </>
            )}
        </DropdownContainer>
    );
}