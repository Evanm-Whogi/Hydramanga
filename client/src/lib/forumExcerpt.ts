export function forumExcerpt(content: string, maxLen = 120): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen).trimEnd()}…`;
}

export function postVoteScore(votes?: { type: string }[]): number {
  if (!votes?.length) return 0;
  return votes.reduce((sum, vote) => sum + (vote.type === 'like' ? 1 : -1), 0);
}

export function applyPostVote<T extends { id: number; votes?: { userId: string; type: string }[]; isPinned?: boolean }>(posts: T[], postId: number, userId: string, type: 'like' | 'dislike', sort?: string): T[] {
  const next = posts.map((post) => {
    if (post.id !== postId) return post;
    const votes = [...(post.votes ?? [])];
    const existingIndex = votes.findIndex((vote) => vote.userId === userId);
    if (existingIndex === -1) {
      votes.push({ userId, type });
    } else if (votes[existingIndex].type === type) {
      votes.splice(existingIndex, 1);
    } else {
      votes[existingIndex] = { ...votes[existingIndex], type };
    }
    return { ...post, votes };
  });
  if (sort !== 'top') return next;
  const pinned = next.filter((post) => post.isPinned);
  const rest = [...next.filter((post) => !post.isPinned)].sort((a, b) => postVoteScore(b.votes) - postVoteScore(a.votes));
  return [...pinned, ...rest];
}

export function applyReplyVote<T extends { id: number; votes?: { userId: string; type: string }[]; replies?: T[] }>(replies: T[], replyId: number, userId: string, type: 'like' | 'dislike'): T[] {
  return replies.map((reply) => {
    if (reply.id === replyId) {
      const votes = [...(reply.votes ?? [])];
      const existingIndex = votes.findIndex((vote) => vote.userId === userId);
      if (existingIndex === -1) {
        votes.push({ userId, type });
      } else if (votes[existingIndex].type === type) {
        votes.splice(existingIndex, 1);
      } else {
        votes[existingIndex] = { ...votes[existingIndex], type };
      }
      return { ...reply, votes };
    }
    if (reply.replies?.length) {
      return { ...reply, replies: applyReplyVote(reply.replies, replyId, userId, type) };
    }
    return reply;
  });
}
