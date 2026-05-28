'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { addBookmark } from '@/services/bookmarkService';

interface BookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  seriesId: number;
  chapterId: number;
  chapterTitle?: string;
  existingNote?: string;
  onSuccess?: () => void;
  mangaTitle?: string;
  chapterNumber?: string | number;
}

export default function BookmarkModal({
  isOpen,
  onClose,
  seriesId,
  chapterId,
  chapterTitle,
  existingNote = '',
  onSuccess,
  mangaTitle = '',
  chapterNumber,
}: BookmarkModalProps) {
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setNote(existingNote);
    setError('');
  }, [isOpen, existingNote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await addBookmark(seriesId, chapterId, note || undefined);
      
      setNote('');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError('Failed to save bookmark. Please try again.');
      console.error('Bookmark error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-background/80 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-foreground border border-background rounded-lg shadow-lg max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-background">
            <h2 className="text-lg font-semibold">
              {existingNote ? 'Edit Bookmark' : 'Add Bookmark'}
            </h2>
            <button
              onClick={onClose}
              className="text-muted hover:text-primary transition-colors hover:cursor-pointer"
              aria-label="Close">
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {chapterTitle && (
              <div className="flex gap-2 text-muted">
                <p className="font-medium text-primary mb-1">Chapter:</p>
                <p className="line-clamp-2">{chapterTitle}</p>
              </div>
            )}

            {/* Note Input */}
            <div className="space-y-2">
              <label htmlFor="note" className="text-sm font-medium">
                Note (optional)
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note or reminder about this chapter..."
                className="w-full px-3 py-2 mt-2 bg-background text-primary rounded-md border border-borders focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                rows={4}
                disabled={isLoading}
              />
              <p className="text-xs text-muted">
                {note.length}/500 characters
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded text-sm text-red-500">
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-sm hover:cursor-pointer bg-background hover:bg-background/50 rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm hover:cursor-pointer bg-accent hover:bg-accent/80 text-white rounded-md transition-colors disabled:opacity-50 font-medium"
              >
                {isLoading ? 'Saving...' : 'Save Bookmark'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
