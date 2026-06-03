"use client";

import { usePathname } from 'next/navigation';
import MaintenancePage from '@/components/MaintenancePage';

const ALLOWED_PREFIXES = ['/login', '/admin'];

type MaintenanceGateProps = {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  isAdmin: boolean;
  children: React.ReactNode;
};

export default function MaintenanceGate({ maintenanceMode, maintenanceMessage, isAdmin, children }: MaintenanceGateProps) {
  const pathname = usePathname();

  if (!maintenanceMode || isAdmin) return <>{children}</>;
  
  const allowed = ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (allowed) return <>{children}</>;
  
  return <MaintenancePage message={maintenanceMessage} />;
}
