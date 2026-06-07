export type ThreadNode<T> = T & { replies: ThreadNode<T>[] };

type ThreadRow = { id: number; parentId: number | null };

/** Build a nested reply tree from a flat list. Orphans are promoted to top-level. */
export function buildThreadTree<T extends ThreadRow>(flat: T[]): ThreadNode<T>[] {
  const byId = new Map<number, ThreadNode<T>>();
  for (const row of flat) {
    byId.set(row.id, { ...row, replies: [] });
  }

  const roots: ThreadNode<T>[] = [];
  for (const node of byId.values()) {
    if (node.parentId == null) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parentId);
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }

  const sortReplies = (nodes: ThreadNode<T>[]) => {
    nodes.sort((a, b) => {
      const aTime = (a as { createdAt?: Date | string }).createdAt;
      const bTime = (b as { createdAt?: Date | string }).createdAt;
      if (aTime && bTime) return new Date(aTime).getTime() - new Date(bTime).getTime();
      return a.id - b.id;
    });
    for (const node of nodes) {
      if (node.replies.length) sortReplies(node.replies);
    }
  };
  sortReplies(roots);

  return roots;
}

/** Count all nodes in a forest (including nested replies). */
export function countThreadNodes<T extends { replies?: T[] }>(nodes: T[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1;
    if (node.replies?.length) total += countThreadNodes(node.replies);
  }
  return total;
}
