"use client";

type CommentListHeaderProps<T extends string> = {
  total: number;
  sort: T;
  options: { value: T; label: string }[];
  onSortChange: (sort: T) => void;
  className?: string;
  itemNoun?: string;
};

export default function CommentListHeader<T extends string>({ total, sort, options, onSortChange, className = "", itemNoun = "comment" }: CommentListHeaderProps<T>) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-4 ${className}`}>
      <span className="text-sm text-muted">
        {total} {itemNoun}{total === 1 ? "" : "s"}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSortChange(opt.value)}
            className={`px-3 py-1 rounded-md text-sm transition-colors ${
              sort === opt.value ? "bg-accent/15 text-accent font-medium" : "text-muted hover:text-primary hover:bg-background/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
