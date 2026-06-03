import Link from 'next/link';
import { Construction } from 'lucide-react';
import { DEFAULT_MAINTENANCE_MESSAGE } from '@/lib/defaultWelcomeModal';

export default function MaintenancePage({ message }: { message?: string | null }) {
  const body = message?.trim() || DEFAULT_MAINTENANCE_MESSAGE;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Construction className="size-16 text-muted mb-6" aria-hidden />
      <h1 className="text-3xl font-bold text-primary mb-3">Under maintenance</h1>
      <p className="text-muted max-w-md leading-relaxed whitespace-pre-wrap">{body}</p>
      <p className="text-sm text-muted mt-6">
        Site administrators can{' '}<Link href="/login" className="text-accent hover:text-accent/80">sign in here</Link>.
      </p>
    </div>
  );
}
