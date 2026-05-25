'use client';

import { useEffect, useState } from 'react';
import { shouldShowWelcomeModal } from '@/lib/welcomeModal';
import { WelcomeModal } from '@/components/WelcomeModal';

export default function WelcomeModalGate() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (shouldShowWelcomeModal()) {
      setIsOpen(true);
    }
  }, []);

  return <WelcomeModal isOpen={isOpen} onClose={() => setIsOpen(false)} />;
}
