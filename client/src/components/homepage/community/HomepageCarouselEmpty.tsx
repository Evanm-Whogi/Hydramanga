import type { LucideIcon } from "lucide-react";

export default function HomepageCarouselEmpty({ title, icon: Icon, message }: { title: string; icon: LucideIcon; message: string }) {
  return (
    <section>
      <h2 className="mb-4 text-3xl font-bold text-primary">{title}</h2>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-borders bg-foreground px-6 py-12 text-center">
        <Icon className="mb-3 size-8 text-muted/60" />
        <p className="text-sm text-muted">{message}</p>
      </div>
    </section>
  );
}
