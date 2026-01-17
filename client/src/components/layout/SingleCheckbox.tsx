import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export default function SingleCheckbox({ label, description, className, ...props }: CheckboxProps) {
  return (
    <label className={`group flex items-start gap-3 cursor-pointer select-none ${className}`}>
      <div className="relative flex items-center mt-0.5">
        <input type="checkbox" {...props} className="peer appearance-none w-5 h-5 bg-foreground border border-borders rounded-md checked:bg-primary checked:border-primary transition-all outline-none focus:ring-1 focus:ring-borders" />
        <svg className="absolute w-3.5 h-3.5 left-0.75 pointer-events-none hidden peer-checked:block text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-muted leading-tight">{label}</span>
        {description && <span className="text-xs text-muted/60">{description}</span>}
      </div>
    </label>
  );
}