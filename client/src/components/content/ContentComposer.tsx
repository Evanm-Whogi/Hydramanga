"use client";

import type { FormEvent, ReactNode } from "react";
import MarkdownEditor from "@/components/markdown/MarkdownEditor";

const titleInputClass =
  "w-full min-w-0 max-w-full box-border bg-background rounded-lg px-3 py-2 text-primary border border-borders placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent overflow-x-hidden";

export function ComposerPrimaryButton({
  children,
  type = "button",
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${className}`}
    >
      {children}
    </button>
  );
}

export function ComposerSecondaryButton({
  children,
  onClick,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm text-muted hover:text-primary border border-borders ${className}`}
    >
      {children}
    </button>
  );
}

type ContentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  minHeight?: string;
  showPreviewToggle?: boolean;
  variant?: "markdown" | "plain";
  maxLength?: number;
  onEnterSubmit?: boolean;

  title?: string;
  onTitleChange?: (value: string) => void;
  titlePlaceholder?: string;
  titleMaxLength?: number;
  titleId?: string;

  heading?: string;

  /** Content above the editor (e.g. rating picker). */
  top?: ReactNode;
  /** Content between editor and buttons (e.g. publish options). */
  middle?: ReactNode;

  onSubmit: () => void | Promise<void>;
  submitLabel: string;
  submitting?: boolean;
  disabled?: boolean;
  submitIcon?: ReactNode;

  onCancel?: () => void;
  cancelLabel?: string;

  /** card = bordered box; reply = indented; embedded = stack only; bar = single-row (chat) */
  layout?: "card" | "reply" | "embedded" | "bar";
  className?: string;

  asForm?: boolean;
  formOnSubmit?: (e: FormEvent) => void;

  /** Shown when rate-limited (submit and Enter are blocked). */
  rateLimited?: boolean;
  rateLimitHint?: string;
};

function shellClass(layout: ContentComposerProps["layout"], className: string) {
  const base =
    layout === "card"
      ? "p-2 space-y-3 border border-borders bg-foreground rounded-md min-w-0 overflow-x-hidden"
      : layout === "reply"
        ? "mt-3 space-y-2 pl-[52px]"
        : layout === "bar"
          ? "flex flex-wrap items-center gap-2"
          : "space-y-3";
  return className ? `${base} ${className}` : base;
}

export default function ContentComposer({
  value,
  onChange,
  placeholder,
  rows = 4,
  minHeight,
  showPreviewToggle = false,
  variant = "markdown",
  maxLength,
  onEnterSubmit = false,
  title,
  onTitleChange,
  titlePlaceholder = "Title",
  titleMaxLength,
  titleId,
  heading,
  top,
  middle,
  onSubmit,
  submitLabel,
  submitting = false,
  disabled = false,
  submitIcon,
  onCancel,
  cancelLabel = "Cancel",
  layout = "card",
  className = "",
  asForm = false,
  formOnSubmit,
  rateLimited = false,
  rateLimitHint,
}: ContentComposerProps) {
  const isSubmitBlocked = disabled || submitting || rateLimited;

  const handleSubmit = () => {
    if (isSubmitBlocked) return;
    void onSubmit();
  };

  const enterSubmitEnabled = onEnterSubmit && !isSubmitBlocked;

  const isBar = layout === "bar";

  const editor =
    variant === "markdown" ? (
      <MarkdownEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        minHeight={minHeight}
        showPreviewToggle={showPreviewToggle}
        maxLength={maxLength}
        onEnterSubmit={enterSubmitEnabled}
        onSubmit={enterSubmitEnabled ? handleSubmit : undefined}
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (enterSubmitEnabled && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`${titleInputClass} ${isBar ? "flex-1 min-w-0" : ""}`}
      />
    );

  const actions = (
    <div className={`flex flex-wrap gap-2 ${isBar ? "shrink-0" : ""}`}>
      <ComposerPrimaryButton
        type={asForm ? "submit" : "button"}
        onClick={asForm ? undefined : handleSubmit}
        disabled={isSubmitBlocked}
      >
        {submitIcon}
        {submitting ? "Posting…" : rateLimited ? "Rate limited" : submitLabel}
      </ComposerPrimaryButton>
      {onCancel && (
        <ComposerSecondaryButton type="button" onClick={onCancel}>
          {cancelLabel}
        </ComposerSecondaryButton>
      )}
      {rateLimited && rateLimitHint && (
        <p className="text-xs text-amber-400/90 w-full">{rateLimitHint}</p>
      )}
    </div>
  );

  const body = isBar ? (
    <>
      {editor}
      {actions}
    </>
  ) : (
    <>
      {heading && <h2 className="text-xl font-bold text-primary">{heading}</h2>}
      {title !== undefined && onTitleChange && (
        <input
          id={titleId}
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          maxLength={titleMaxLength}
          className={titleInputClass}
        />
      )}
      {top}
      {editor}
      {middle}
      {actions}
    </>
  );

  const wrapperClass = shellClass(layout, className);

  if (asForm) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isSubmitBlocked) return;
          if (formOnSubmit) formOnSubmit(e);
          else handleSubmit();
        }}
        className={wrapperClass}
      >
        {body}
      </form>
    );
  }

  return <div className={wrapperClass}>{body}</div>;
}
