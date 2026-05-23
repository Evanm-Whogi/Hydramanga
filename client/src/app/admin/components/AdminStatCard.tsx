import type { LucideIcon } from "lucide-react";

interface AdminStatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  iconClassName?: string;
}

export default function AdminStatCard({label, value, hint, icon: Icon, iconClassName = "text-accent"}: AdminStatCardProps) {
  return (
    <div className="bg-foreground/50 rounded-lg p-6 border border-borders/30 hover:border-borders/60 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted">{label}</h3>
        <Icon className={`size-5 ${iconClassName}`} />
      </div>
      <p className="text-3xl font-bold text-primary">{value}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}
