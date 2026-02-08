'use client';
import { useState } from "react";
import DropdownContainer from "@/components/DropdownContainer";

interface Option {
    label: string;
    value: string;
}

export default function SingleDropdown({ title, options, size, onChange, initialValue }: { title?: string; options?: Option[]; size?: string; onChange: (val: string) => void; initialValue?: string }) {
    const [selectedLabel, setSelectedLabel] = useState(() => {
        if (initialValue) {
            const option = options?.find(opt => opt.value === initialValue);
            return option ? option.label : options?.[0]?.label || "";
        }
        return options?.[0]?.label || "";
    });

    const handleSelect = (option: Option | null, setIsOpen: (open: boolean) => void) => {
        const label = option ? option.label : "";
        const value = option ? option.value : "";
        
        setSelectedLabel(label);
        onChange(value);
        setIsOpen(false);
    };

    return (
        <DropdownContainer title={title} size={size} selectedLabel={selectedLabel}>
            {(setIsOpen) => (
                <>
                    {options?.map((option) => (
                        <div key={option.value} onClick={() => handleSelect(option, setIsOpen)} className="px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer text-sm text-primary">{option.label}</div>
                    ))}
                </>
            )}
        </DropdownContainer>
    );
}