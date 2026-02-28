"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Code,
  SquareCode,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Eye,
  EyeOff,
} from "lucide-react";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "u"],
};

type ToolbarAction =
  | "bold"
  | "italic"
  | "underline"
  | "code"
  | "codeBlock"
  | "h1"
  | "h2"
  | "h3"
  | "ul"
  | "ol";

function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = "text"
): string {
  const selected = start !== end ? text.slice(start, end) : placeholder;
  return text.slice(0, start) + before + selected + after + text.slice(end);
}

function blockWrap(
  text: string,
  start: number,
  end: number,
  prefix: string
): string {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);
  const lineEndPos = lineEnd === -1 ? text.length : lineEnd;
  const line = text.slice(lineStart, lineEndPos);
  const selected = start !== end ? text.slice(start, end) : "";
  const newLine =
    prefix + (selected || line || prefix.replace(/^[\s#.-]+/, ""));
  return (
    text.slice(0, lineStart) +
    newLine +
    (lineEnd === -1 ? "\n" : text.slice(lineEnd))
  );
}

function insertCodeBlock(text: string, start: number, end: number): string {
  const selected = start !== end ? text.slice(start, end) : "code here";
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);
  const afterStart = lineEnd === -1 ? text.length : lineEnd;
  const before = text.slice(0, lineStart);
  const after = text.slice(afterStart);
  return before + "```\n" + selected + "\n```\n" + after;
}

function ToolButton({
  onClick,
  title,
  icon,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-2 text-muted hover:text-primary hover:bg-background/50 border-r border-borders last:border-r-0"
    >
      {icon}
    </button>
  );
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = "Markdown supported: **bold**, *italic*, `code`, lists...",
  rows = 4,
  showPreviewToggle = false,
  minHeight = "min-h-[100px]",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  showPreviewToggle?: boolean;
  minHeight?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const insert = (action: ToolbarAction) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    let next = value;
    switch (action) {
      case "bold":
        next = wrapSelection(value, start, end, "**", "**", "bold text");
        break;
      case "italic":
        next = wrapSelection(value, start, end, "*", "*", "italic text");
        break;
      case "underline":
        next = wrapSelection(value, start, end, "<u>", "</u>", "underline");
        break;
      case "code":
        next = wrapSelection(value, start, end, "`", "`", "code");
        break;
      case "codeBlock":
        next = insertCodeBlock(value, start, end);
        break;
      case "h1":
        next = blockWrap(value, start, end, "# ");
        break;
      case "h2":
        next = blockWrap(value, start, end, "## ");
        break;
      case "h3":
        next = blockWrap(value, start, end, "### ");
        break;
      case "ul":
        next = blockWrap(value, start, end, "- ");
        break;
      case "ol":
        next = blockWrap(value, start, end, "1. ");
        break;
      default:
        return;
    }
    onChange(next);
    ta.focus();
    setTimeout(() => ta.setSelectionRange(start, end), 0);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex rounded-lg border border-borders overflow-hidden">
          <ToolButton onClick={() => insert("bold")} title="Bold" icon={<Bold className="size-4" />} />
          <ToolButton onClick={() => insert("italic")} title="Italic" icon={<Italic className="size-4" />} />
          <ToolButton onClick={() => insert("underline")} title="Underline" icon={<UnderlineIcon className="size-4" />} />
          <ToolButton onClick={() => insert("code")} title="Inline code" icon={<Code className="size-4" />} />
          <ToolButton onClick={() => insert("codeBlock")} title="Code block" icon={<SquareCode className="size-4" />} />
          <ToolButton onClick={() => insert("h1")} title="Heading 1" icon={<Heading1 className="size-4" />} />
          <ToolButton onClick={() => insert("h2")} title="Heading 2" icon={<Heading2 className="size-4" />} />
          <ToolButton onClick={() => insert("h3")} title="Heading 3" icon={<Heading3 className="size-4" />} />
          <ToolButton onClick={() => insert("ul")} title="Bullet list" icon={<List className="size-4" />} />
          <ToolButton onClick={() => insert("ol")} title="Numbered list" icon={<ListOrdered className="size-4" />} />
        </div>
        {showPreviewToggle && (
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="flex items-center gap-1 text-xs text-muted hover:text-primary"
          >
            {preview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {preview ? "Edit" : "Preview"}
          </button>
        )}
      </div>
      {showPreviewToggle && preview ? (
        <div
          className={`rounded-lg border border-borders bg-background p-4 text-primary prose prose-invert prose-sm max-w-none dark:prose-invert prose-pre:bg-foreground prose-pre:border prose-pre:border-borders prose-pre:rounded-lg prose-pre:overflow-x-auto prose-code:bg-foreground/80 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none ${minHeight}`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
          >
            {value || "*No content yet*"}
          </ReactMarkdown>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`w-full rounded-lg border border-borders bg-background px-3 py-2 text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-y ${minHeight}`}
        />
      )}
    </div>
  );
}
