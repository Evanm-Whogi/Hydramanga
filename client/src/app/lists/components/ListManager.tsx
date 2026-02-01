'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect } from 'react';
import { reorderLists } from '@/services/listService';
import { toast } from 'react-toastify';
import { UserList, createList, deleteList, updateList } from '@/services/listService';
import { Trash2, Eye, EyeOff, Plus, Edit2, Check, X, GripVertical } from 'lucide-react';

interface ListManagerProps {
  lists: UserList[];
  onUpdate: () => void;
}

export default function ListManager({ lists, onUpdate }: ListManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmedName = newListName.trim();
    if (!trimmedName) return;
    // Prevent duplicate names (case-insensitive)
    if (lists.some((l) => l.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError('A list with that name already exists.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await createList(trimmedName);
      setNewListName('');
      setIsCreating(false);
      toast.success('List created!');
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create list');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (listId: number, listName: string) => {
    if (!confirm(`Are you sure you want to delete "${listName}"? All manga in this list will be removed from it.`)) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await deleteList(listId);
      toast.success('List deleted!');
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete list');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleVisibility = async (list: UserList) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await updateList(list.id, { isVisible: !list.isVisible });
      toast.success(`List "${list.name}" is now ${list.isVisible ? 'hidden' : 'visible'}`);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update list');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEdit = (list: UserList) => {
    setEditingId(list.id);
    setEditingName(list.name);
  };

  const handleSaveEdit = async (listId: number) => {
    const trimmedName = editingName.trim();
    if (!trimmedName) return;
    // Prevent duplicate names (case-insensitive, except for the current list)
    if (lists.some((l) => l.id !== listId && l.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError('A list with that name already exists.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await updateList(listId, { name: trimmedName });
      setEditingId(null);
      setEditingName('');
      toast.success('List renamed!');
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to update list');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const [dragLists, setDragLists] = useState(() => [...lists].sort((a, b) => a.sortOrder - b.sortOrder));
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Keep dragLists in sync with lists prop
  useEffect(() => {
    setDragLists([...lists].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [lists]);

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = dragLists.findIndex((l) => l.id === Number(active.id));
    const newIndex = dragLists.findIndex((l) => l.id === Number(over.id));
    const reordered = arrayMove(dragLists, oldIndex, newIndex);
    setDragLists(reordered);
    // Update sortOrder for each list
    const listOrders = reordered.map((l, idx) => ({ id: l.id, sortOrder: idx }));
    try {
      await reorderLists(listOrders);
      toast.success('List order updated!');
      onUpdate();
    } catch (err: any) {
      toast.error('Failed to update order');
    }
  };

  function SortableListItem({ list, editingId, ...props }: any) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: list.id, disabled: isLoading || editingId === list.id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 10 : undefined,
    };
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
          list.isVisible ? 'bg-base-200' : 'bg-base-200/60'
        } ${isDragging ? 'ring-2 ring-primary' : ''}`}
        aria-label={`List: ${list.name}`}
      >
        <button
          type="button"
          className="px-2 py-1 bg-background text-white cursor-grab"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        {props.children}
      </div>
    );
  }

  return (
    <div className="bg-foreground border border-background rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Manage Lists</h2>
        <button
          onClick={() => setIsCreating(true)}
          disabled={isLoading || isCreating}
          className="flex items-center px-2 py-1 bg-background text-white gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New List
        </button>
      </div>

      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="px-2 py-1 bg-background text-white hover:cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isCreating && (
        <div className="flex gap-2 mb-4 p-3 bg-background/50 rounded-md">
          <input
            type="text"
            placeholder="List name..."
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setIsCreating(false);
                setNewListName('');
              }
            }}
            className="input input-bordered input-sm flex-1 pl-2"
            autoFocus
            disabled={isLoading}
            aria-label="New list name"
          />
          <button
            onClick={handleCreate}
            disabled={isLoading || !newListName.trim()}
            className="px-2 py-1 bg-background text-white hover:bg-background/50 hover:cursor-pointer"
            aria-label="Create list"
          >
            {isLoading ? (
              <span className="loading loading-spinner loading-xs" aria-label="Loading" />
            ) : (
              <Check className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => {
              setIsCreating(false);
              setNewListName('');
            }}
            disabled={isLoading}
            className="px-2 py-1 bg-background text-white hover:bg-background/50 hover:cursor-pointer"
            aria-label="Cancel create"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={dragLists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {isLoading && (
              <div className="flex justify-center py-2">
                <span className="loading loading-spinner loading-md" aria-label="Loading" />
              </div>
            )}
            {dragLists.map((list) => (
              <SortableListItem key={list.id} list={list} editingId={editingId}>
                {editingId === list.id ? (
                  <>
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(list.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="input input-bordered input-sm flex-1"
                      autoFocus
                      disabled={isLoading}
                      aria-label="Edit list name"
                    />
                    <button
                      onClick={() => handleSaveEdit(list.id)}
                      disabled={isLoading || !editingName.trim()}
                      className="px-2 py-1 bg-background text-white hover:cursor-pointer"
                      aria-label="Save list name"
                    >
                      {isLoading ? (
                        <span className="loading loading-spinner loading-xs" aria-label="Loading" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={isLoading}
                      className="px-2 py-1 bg-background text-white hover:cursor-pointer"
                      aria-label="Cancel edit"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm">
                        {list.name}
                        {list.isDefault && (
                          <span className="ml-2 text-xs opacity-60">Default</span>
                        )}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(list)}
                      disabled={isLoading}
                      className="hover:cursor-pointer"
                      title="Rename list"
                      aria-label="Rename list"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(list)}
                      disabled={isLoading}
                      className="text-white hover:cursor-pointer"
                      title={list.isVisible ? 'Hide list' : 'Show list'}
                      aria-label={list.isVisible ? 'Hide list' : 'Show list'}
                    >
                      {list.isVisible ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                    {!list.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleDelete(list.id, list.name)}
                        disabled={isLoading}
                        className=" text-red-600 hover:cursor-pointer"
                        title="Delete list"
                        aria-label="Delete list"
                      >
                        {isLoading ? (
                          <span className="loading loading-spinner loading-xs" aria-label="Loading" />
                        ) : (
                          <Trash2 className="size-5" />
                        )}
                      </button>
                    )}
                  </>
                )}
              </SortableListItem>
            ))}
            {dragLists.length === 0 && (
              <div className="text-center py-8 text-base-content/60">
                No lists yet. Create your first list to get started!
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
