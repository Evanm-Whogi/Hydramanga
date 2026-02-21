import { formatDate, formatTimeAgo } from '@/lib/utils';
import Link from 'next/link';

function renderInline(line: string, keyOffset: number): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`)/g; 
    
    let last = 0;
    let match: RegExpExecArray | null;
    let key = keyOffset;

    while ((match = regex.exec(line)) !== null) {
        if (match.index > last) {
            parts.push(line.slice(last, match.index));
        }

        // match[2] = Bold (** content **)
        // match[3] = Italic (* content *)
        // match[4] = Code (` content `)
        if (match[2] !== undefined) {
            parts.push(<strong key={key++}>{match[2]}</strong>);
        } else if (match[3] !== undefined) {
            parts.push(<em key={key++}>{match[3]}</em>);
        } else if (match[4] !== undefined) {
            parts.push(
                <code key={key++} className="bg-background rounded px-1 py-0.5 text-sm font-mono text-primary">
                    {match[4]}
                </code>
            );
        }
        last = regex.lastIndex;
    }

    if (last < line.length) {
        parts.push(line.slice(last));
    }
    return parts;
}

function MarkdownText({ text }: { text: string }) {
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let key = 0;
    lines.forEach((line, i) => {
        result.push(...renderInline(line, key));
        key += 100;
        if (i < lines.length - 1) result.push(<br key={`br-${i}`} />);
    });
    return <>{result}</>;
}

function insertMarkdown(ref: React.RefObject<HTMLTextAreaElement | null>, setter: (v: string) => void, wrap: [string, string], placeholder: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end) || placeholder;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const newVal = `${before}${wrap[0]}${selected}${wrap[1]}${after}`;
    setter(newVal);
    setTimeout(() => {
        el.focus();
        const cursor = before.length + wrap[0].length + selected.length + wrap[1].length;
        el.setSelectionRange(cursor, cursor);
    }, 0);
}

export default function CommentCard({ comment }: { comment: any }) {
    return (
        <div className="bg-foreground p-4 rounded-md shadow-md relative">
            <div className="flex items-center mb-2">
                <img src={comment.author.image || '/default-avatar.jpg'} alt={comment.author.name} className="w-10 h-10 rounded-full mr-3" />
                <div>
                    <h3 className="text-lg font-semibold">{comment.author.name}</h3>
                    <p className="text-sm text-muted">{formatTimeAgo(comment.createdAt)}</p>
                </div>
            </div>
            <p className="text-base pb-12 md:pb-6"><MarkdownText text={comment.content} /></p>
            <Link href={`/manga/${comment.series.id}`} className="absolute bottom-0 left-0 p-2 mt-2 text-sm text-primary hover:text-accent"><span className="text-muted">On:</span> {comment.series.title}</Link>
        </div>
    );
}