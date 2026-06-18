"use client";

import { homepageCarouselFilterButtonClass } from "@/lib/homepageCarouselControls";

export default function HomepageFilterButtons<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (next: T) => void }) {
  return (
    <>
      {options.map(({ value: optionValue, label }) => (
        <button key={optionValue} type="button" onClick={() => onChange(optionValue)} className={homepageCarouselFilterButtonClass(value === optionValue)}>
          {label}
        </button>
      ))}
    </>
  );
}
