'use client';

import ListManager from './ListManager';
import { UserList } from '@/services/listService';
import { X } from 'lucide-react';

interface ListManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lists: UserList[];
  onUpdate: () => void;
}

export default function ListManagerModal({ isOpen, onClose, lists, onUpdate }: ListManagerModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-background/80 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-foreground border border-background rounded-lg shadow-lg max-w-2xl w-full">
          <div className="flex items-center justify-between p-4 border-b border-background">
            <h2 className="text-lg font-semibold">Manage Lists</h2>
            <button
              onClick={onClose}
              className="text-muted hover:text-primary transition-colors hover:cursor-pointer"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-4">
            <ListManager lists={lists} onUpdate={onUpdate} />
          </div>
        </div>
      </div>
    </>
  );
}
