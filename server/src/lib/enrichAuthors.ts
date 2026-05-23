import { karmaService } from '@/services/karmaService';

type WithAuthor = { author?: { id: string } | null };

/** Attach levelName from karma to author objects. */
export async function enrichAuthors<T extends WithAuthor>(items: T[]): Promise<T[]> {
  const userIds = [...new Set(items.map((i) => i.author?.id).filter(Boolean))] as string[];
  if (userIds.length === 0) return items;

  const karmaMap = await karmaService.getKarmaSummaries(userIds);

  return items.map((item) => {
    if (!item.author) return item;
    const karma = karmaMap[item.author.id];
    return {
      ...item,
      author: {
        ...item.author,
        levelName: karma?.levelName ?? 'Rookie Reader',
      },
    };
  });
}

/** Enrich authors on comments and their nested replies. */
export async function enrichCommentsWithKarma<T extends WithAuthor & { replies?: WithAuthor[] }>(
  comments: T[]
): Promise<T[]> {
  const top = await enrichAuthors(comments);
  return Promise.all(
    top.map(async (comment) => {
      if (!comment.replies?.length) return comment;
      const replies = await enrichAuthors(comment.replies);
      return { ...comment, replies };
    })
  );
}
