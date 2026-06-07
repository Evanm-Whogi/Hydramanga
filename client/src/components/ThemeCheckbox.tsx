'use client';

import { Check, Minus } from 'lucide-react';

interface ThemeCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}

export default function ThemeCheckbox({ checked, indeterminate = false, onCheckedChange, disabled = false, ariaLabel, className = '' }: ThemeCheckboxProps) {
  const isActive = checked || indeterminate;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onCheckedChange}
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ${isActive ? 'border-accent bg-accent text-white' : 'border-borders bg-background hover:border-accent/60'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
    >
      {indeterminate ? <Minus className="size-3" strokeWidth={3} /> : checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </button>
  );
}
