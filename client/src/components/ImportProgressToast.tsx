'use client';
import { toast, Id } from 'react-toastify';
import { MangaImportProgress } from '@/services/progressService';

function ImportProgressToastContent({ progress, mangaTitle }: { progress: MangaImportProgress; mangaTitle: string }) {
  const { totalChapters, downloadedChapters, percentage, status } = progress;

  const getStatusText = () => {
    switch (status) {
      case 'scanning':
        return 'Scanning for chapters...';
      case 'downloading':
        return `Downloading: ${downloadedChapters}/${totalChapters} chapters`;
      case 'completed':
        return totalChapters === 0 
          ? '✓ Chapters not found'
          : `✓ Completed: ${totalChapters} chapters downloaded`;
      case 'failed':
        return `✗ Failed: ${progress.errorMessage || 'Unknown error'}`;
      default:
        return 'Processing...';
    }
  };

  const getProgressColor = () => {
    switch (status) {
      case 'scanning':
        return 'bg-blue-500';
      case 'downloading':
        return 'bg-accent';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex flex-col gap-2 w-80 overflow-hidden">
      <div className="flex items-start justify-between gap-2 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="font-semibold text-sm truncate">{mangaTitle}</div>
          <div className="text-xs text-gray-300 mt-1 line-clamp-2">{getStatusText()}</div>
        </div>
        {status === 'downloading' && (
          <div className="text-sm font-bold text-white shrink-0 ml-2">{percentage}%</div>
        )}
      </div>
      
      {status === 'downloading' && totalChapters > 0 && (
        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full ${getProgressColor()} transition-all duration-300 ease-out`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      
      {status === 'scanning' && (
        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
          <div className="h-full bg-blue-500 animate-pulse w-full" />
        </div>
      )}
    </div>
  );
}

export function showImportProgressToast(
  mangaId: number,
  mangaTitle: string,
  initialProgress?: MangaImportProgress
): Id {
  const toastId = `import-progress-${mangaId}`;

  // Check if toast already exists
  if (toast.isActive(toastId)) {
    if (initialProgress) {
      toast.update(toastId, {
        render: <ImportProgressToastContent progress={initialProgress} mangaTitle={mangaTitle} />,
      });
    }
    return toastId;
  }

  // Create new toast
  return toast(
    <ImportProgressToastContent 
      progress={initialProgress || {
        seriesId: mangaId,
        totalChapters: 0,
        downloadedChapters: 0,
        status: 'scanning',
        percentage: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }} 
      mangaTitle={mangaTitle}
    />,
    {
      toastId,
      autoClose: false,
      closeButton: false,
      draggable: false,
      type: 'info',
      position: 'top-right',
    }
  );
}

export function updateImportProgressToast(
  mangaId: number,
  mangaTitle: string,
  progress: MangaImportProgress
): void {
  const toastId = `import-progress-${mangaId}`;

  if (!toast.isActive(toastId)) {
    showImportProgressToast(mangaId, mangaTitle, progress);
    return;
  }

  // Determine toast type based on status
  const toastType = progress.status === 'completed' 
    ? 'success' 
    : progress.status === 'failed' 
    ? 'error' 
    : 'info';

  toast.update(toastId, {
    render: <ImportProgressToastContent progress={progress} mangaTitle={mangaTitle} />,
    type: toastType,
    autoClose: progress.status === 'completed' || progress.status === 'failed' ? 5000 : false,
    closeButton: progress.status === 'completed' || progress.status === 'failed',
  });
}

export function dismissImportProgressToast(mangaId: number): void {
  const toastId = `import-progress-${mangaId}`;
  if (toast.isActive(toastId)) {
    toast.dismiss(toastId);
  }
}
