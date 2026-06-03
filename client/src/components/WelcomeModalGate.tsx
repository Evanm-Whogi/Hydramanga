'use client';

import { useEffect, useState } from 'react';
import { shouldShowWelcomeModal } from '@/lib/welcomeModal';
import { WelcomeModal } from '@/components/WelcomeModal';
import type { PublicSiteSettings } from '@/services/siteSettingsService';

export default function WelcomeModalGate({ siteSettings }: { siteSettings: PublicSiteSettings }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!siteSettings.welcomeModalEnabled) return;
    if (shouldShowWelcomeModal()) {
      setIsOpen(true);
    }
  }, [siteSettings.welcomeModalEnabled]);

  if (!siteSettings.welcomeModalEnabled) return null;

  return (
    <WelcomeModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={siteSettings.welcomeModalTitle}
      description={siteSettings.welcomeModalDescription}
      bodyMarkdown={siteSettings.welcomeModalBody}
      registrationEnabled={siteSettings.registrationEnabled}
    />
  );
}
