'use client';

import { toast, Id } from 'react-toastify';

interface ContinuousModeToastProps {
  mangaId: number;
  mangaTitle: string;
  onEnable: () => void;
}

function ContinuousModeToastContent({ mangaTitle, onEnable }: { mangaTitle: string; onEnable: () => void }) {
  return (
    <div className="flex flex-col gap-3 w-80">
      <div className="text-sm font-semibold">Continuous Mode Available</div>
      <div className="text-xs text-gray-300">
        {mangaTitle} has single-page chapters. Enable continuous mode for a single long scroll.
      </div>
      <div className="flex gap-2">
        <button
          onClick={onEnable}
          className="px-3 py-1.5 bg-accent hover:bg-accent/80 text-white rounded text-xs font-semibold"
        >
          Enable
        </button>
      </div>
    </div>
  );
}

export function showContinuousModeToast({ mangaId, mangaTitle, onEnable }: ContinuousModeToastProps): Id {
  const toastId = `continuous-mode-${mangaId}`;

  if (toast.isActive(toastId)) {
    return toastId;
  }

  return toast(
    <ContinuousModeToastContent mangaTitle={mangaTitle} onEnable={onEnable} />,
    {
      toastId,
      autoClose: 8000,
      closeButton: true,
      draggable: true,
      type: 'info',
      position: 'top-right',
    }
  );
}

export function dismissContinuousModeToast(mangaId: number): void {
  const toastId = `continuous-mode-${mangaId}`;
  if (toast.isActive(toastId)) {
    toast.dismiss(toastId);
  }
}
