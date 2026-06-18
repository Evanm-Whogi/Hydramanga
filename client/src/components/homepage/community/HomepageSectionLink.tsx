import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HomepageSectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent">
      {label}
      <ArrowRight className="size-4" />
    </Link>
  );
}
