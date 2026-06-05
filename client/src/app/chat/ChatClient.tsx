"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "react-toastify";
import { getChatMessages, postChatMessage, updateChatMessage, deleteChatMessage, muteChatUser } from "@/services/chatService";
import { useChatSocket, type ChatPresenceUser } from "@/hooks/useChatSocket";
import { useUser } from "@/providers/UserProvider";
import { requireTrimmed } from "@/lib/requireContent";
import { useSubmitRateLimit } from "@/hooks/useSubmitRateLimit";
import { toastApiError } from "@/lib/rateLimit";
import ContentComposer from "@/components/content/ContentComposer";
import AuthorByline from "@/components/social/AuthorByline";
import MarkdownView from "@/components/markdown/MarkdownView";
import ContentOverflowMenu from "@/components/social/ContentOverflowMenu";
import { isAdminUser } from "@/lib/contentMenu";
import { requireAuth } from "@/lib/requireAuth";
import { CONTENT_LIMITS } from "@/lib/contentLimits";

interface ChatMsg {
  id: number;
  userId: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    image: string | null;
    role: string;
    levelName?: string;
  };
}

function scrollToBottom(el: HTMLDivElement | null) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

export default function ChatClient() {
  const { user } = useUser();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<ChatPresenceUser[]>([]);
  const [text, setText] = useState("");
  const [menuOpenKey, setMenuOpenKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const isAdmin = isAdminUser(user?.role);
  const {isRateLimited: isSendRateLimited, applyRateLimitFromError: applySendRateLimit, rateLimitSecondsLeft: sendRateLimitSecondsLeft} = useSubmitRateLimit();

  const loadMessages = useCallback(() => {
    getChatMessages(80)
      .then((d) => {
        setMessages(d.messages ?? []);
        stickToBottomRef.current = true;
      })
      .catch(() => toast.error("Failed to load chat"));
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollToBottom(listRef.current);
  }, [messages]);

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  };

  const onSocketEvent = useCallback((event: { type: string; data?: unknown }) => {
    if (event.type === "message" && event.data) {
      const msg = event.data as ChatMsg;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    }
    if (event.type === "message_deleted" && event.data) {
      const { id } = event.data as { id: number };
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }
    if (event.type === "message_updated" && event.data) {
      const msg = event.data as ChatMsg;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    }
    if (event.type === "presence" && event.data) {
      const { users } = event.data as { users: ChatPresenceUser[] };
      setOnlineUsers(users ?? []);
    }
  }, []);

  useChatSocket(onSocketEvent);

  const handleSend = async () => {
    if (!requireAuth(user, '/chat')) return;
    if (isSendRateLimited) return;
    if (!requireTrimmed(text, "Please enter a message.")) return;
    stickToBottomRef.current = true;
    try {
      const { message } = await postChatMessage(text);
      setText("");
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    } catch (err: unknown) {
      if (!applySendRateLimit(err)) toastApiError(err, "Failed to send");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteChatMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      toastApiError(err, "Failed to delete");
    }
  };

  const handleUpdate = async (id: number) => {
    if (!requireTrimmed(editText, "Please enter a message.")) return;
    try {
      const { message } = await updateChatMessage(id, editText);
      setMessages((prev) => prev.map((m) => (m.id === id ? message : m)));
      setEditingId(null);
      setEditText("");
      toast.success("Message updated");
    } catch (err: unknown) {
      toastApiError(err, "Failed to update");
    }
  };

  const handleMuteUser = async (targetUserId: string) => {
    try {
      await muteChatUser(targetUserId, 24, "Moderation");
      toast.success("User muted for 24 hours");
    } catch {
      toast.error("Failed to mute user");
    }
  };

  const chatMessageAdminItems = (msg: ChatMsg) => {
    if (!isAdmin) return [];
    const authorId = msg.author.id;
    if (authorId === user?.id) return [];
    return [
      { label: "Delete", variant: "danger" as const, onClick: () => void handleDelete(msg.id) },
      { label: "Mute user (24h)", onClick: () => void handleMuteUser(authorId) },
    ];
  };

  const sortedOnline = [...onlineUsers].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="container mx-auto px-4 xl:px-0 py-8 w-full md:w-2/3">
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        <div className="flex-1 min-w-0 flex flex-col bg-foreground rounded-lg border border-borders h-[70vh] min-h-[420px]">
          <div
            ref={listRef}
            onScroll={handleListScroll}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">No messages yet. Say hello!</p>
            ) : (
              messages.map((msg) => {
                const isOwner = msg.author.id === user?.id;
                const canUseMenu = isOwner || isAdmin;

                if (editingId === msg.id) {
                  return (
                    <div key={msg.id} className="bg-background rounded-lg p-3 border border-borders">
                      <ContentComposer
                        value={editText}
                        onChange={setEditText}
                        placeholder="Edit message…"
                        variant="markdown"
                        rows={2}
                        minHeight="min-h-[72px]"
                        maxLength={CONTENT_LIMITS.chatMessage}
                        onEnterSubmit
                        onSubmit={() => void handleUpdate(msg.id)}
                        submitLabel="Save"
                        layout="embedded"
                        onCancel={() => {
                          setEditingId(null);
                          setEditText("");
                        }}
                      />
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="flex gap-3 relative">
                    <Link href={`/users/${msg.author.id}`} className="shrink-0">
                      <Image
                        src={msg.author.image || "/default-avatar.jpg"}
                        alt=""
                        width={32}
                        height={32}
                        className="rounded-full size-8 object-cover"
                      />
                    </Link>
                    <div className="min-w-0 flex-1 pr-8">
                      <AuthorByline author={msg.author} createdAt={msg.createdAt} />
                      <div className="prose prose-invert prose-sm max-w-none min-w-0 break-words overflow-x-hidden text-primary mt-1">
                        <MarkdownView content={msg.content} />
                      </div>
                    </div>
                    {canUseMenu && (
                      <div className="absolute top-0 right-0">
                        <ContentOverflowMenu
                          open={menuOpenKey === `msg-${msg.id}`}
                          onOpenChange={(open) => setMenuOpenKey(open ? `msg-${msg.id}` : null)}
                          iconClassName="size-4"
                          isOwner={isOwner}
                          isAdmin={isAdmin}
                          onEdit={
                            isOwner
                              ? () => {
                                  setEditText(msg.content);
                                  setEditingId(msg.id);
                                }
                              : undefined
                          }
                          onDelete={isOwner ? () => void handleDelete(msg.id) : undefined}
                          adminItems={chatMessageAdminItems(msg)}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="shrink-0 border-t border-borders p-2">
            {user ? (
            <ContentComposer
              value={text}
              onChange={setText}
              placeholder="Write a message… (Enter to send, Shift+Enter for newline)"
              variant="markdown"
              rows={2}
              minHeight="min-h-[72px]"
              maxLength={CONTENT_LIMITS.chatMessage}
              onEnterSubmit
              onSubmit={handleSend}
              submitLabel="Send"
              layout="embedded"
              rateLimited={isSendRateLimited}
              rateLimitHint={
                isSendRateLimited
                  ? `Please wait ${sendRateLimitSecondsLeft}s before sending another message.`
                  : undefined
              }
            />
            ) : (
              <p className="text-sm text-muted text-center py-2">Log in to send messages.</p>
            )}
          </div>
        </div>

        <aside className="w-full lg:w-60 shrink-0 bg-foreground rounded-lg border border-borders flex flex-col h-[70vh] min-h-[420px] lg:min-h-0">
          <div className="px-4 py-3 border-b border-borders shrink-0">
            <h2 className="text-sm font-semibold text-primary">Online</h2>
            <p className="text-xs text-muted mt-0.5">{sortedOnline.length} connected</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2">
            {sortedOnline.length === 0 ? (
              <p className="text-xs text-muted px-1">No one else here yet.</p>
            ) : (
              sortedOnline.map((online) => (
                <div
                  key={online.id}
                  className="relative flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-background transition-colors"
                >
                  <Link href={`/users/${online.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                    <Image
                      src={online.image || "/default-avatar.jpg"}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full size-7 object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{online.name}</p>
                      <p className={`text-xs truncate ${online.role === "admin" ? "text-teal-400" : "text-muted"}`}>
                        {online.role === "admin" ? "Admin" : "User"}
                      </p>
                    </div>
                  </Link>
                  {isAdmin && online.id !== user?.id && (
                    <ContentOverflowMenu
                      open={menuOpenKey === `user-${online.id}`}
                      onOpenChange={(open) => setMenuOpenKey(open ? `user-${online.id}` : null)}
                      iconClassName="size-4"
                      isAdmin
                      adminItems={[
                        { label: "Mute user (24h)", onClick: () => void handleMuteUser(online.id) },
                      ]}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
