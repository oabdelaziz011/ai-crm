import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getConversationFlags,
  getMessageReaction,
  getStarredMessageIds,
  setMessageReaction,
  toggleConversationFlag,
  toggleStarredMessage,
} from "@/lib/omnichannel/presentation/conversation-experience-storage";
import { resolveCustomerPresence, type PresenceState } from "@/components/omnichannel/agent-desk/presence-indicator";

export type TypingActor = "customer" | "agent" | "ai" | null;

const UNDO_WINDOW_MS = 5000;

export function useConversationExperience(conversationId: string | null, input?: {
  lastActivityAt?: string | null;
  handlerMode?: "ai" | "human" | "mixed";
  recentCustomerMessageAt?: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [starredIds, setStarredIds] = useState<Set<string>>(() => new Set());
  const [reactionVersion, setReactionVersion] = useState(0);
  const [conversationFlags, setConversationFlags] = useState(() =>
    conversationId ? getConversationFlags(conversationId) : {},
  );
  const [agentTyping, setAgentTyping] = useState(false);
  const [customerTyping, setCustomerTyping] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const undoTimerRef = useRef<number | null>(null);
  const undoIntervalRef = useRef<number | null>(null);
  const pendingSendRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setStarredIds(new Set());
      setConversationFlags({});
      return;
    }
    setStarredIds(getStarredMessageIds(conversationId));
    setConversationFlags(getConversationFlags(conversationId));
  }, [conversationId]);

  useEffect(() => {
    if (!input?.recentCustomerMessageAt) {
      setCustomerTyping(false);
      return;
    }
    const age = Date.now() - new Date(input.recentCustomerMessageAt).getTime();
    if (age > 12_000) {
      setCustomerTyping(false);
      return;
    }
    setCustomerTyping(true);
    const timer = window.setTimeout(() => setCustomerTyping(false), 12_000 - age);
    return () => window.clearTimeout(timer);
  }, [input?.recentCustomerMessageAt]);

  useEffect(() => {
    setAiGenerating(input?.handlerMode === "ai");
  }, [input?.handlerMode, conversationId]);

  const presence: PresenceState = resolveCustomerPresence({
    lastActivityAt: input?.lastActivityAt ?? null,
    isTyping: customerTyping,
  });

  const typingActor: TypingActor = customerTyping
    ? "customer"
    : agentTyping
      ? "agent"
      : aiGenerating
        ? "ai"
        : null;

  const toggleStar = useCallback(
    (messageId: string) => {
      if (!conversationId) return;
      toggleStarredMessage(conversationId, messageId);
      setStarredIds(getStarredMessageIds(conversationId));
    },
    [conversationId],
  );

  const toggleReaction = useCallback(
    (messageId: string, emoji: string | null) => {
      if (!conversationId) return;
      setMessageReaction(conversationId, messageId, emoji);
      setReactionVersion((value) => value + 1);
    },
    [conversationId],
  );

  const getReaction = useCallback(
    (messageId: string) => {
      void reactionVersion;
      return conversationId ? getMessageReaction(conversationId, messageId) : null;
    },
    [conversationId, reactionVersion],
  );

  const toggleConversationBookmark = useCallback(
    (flag: "pinned" | "starred" | "following" | "markedUnread") => {
      if (!conversationId) return;
      setConversationFlags(toggleConversationFlag(conversationId, flag));
    },
    [conversationId],
  );

  const scheduleSendWithUndo = useCallback((execute: () => void) => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    if (undoIntervalRef.current) window.clearInterval(undoIntervalRef.current);

    pendingSendRef.current = execute;
    setUndoSecondsLeft(Math.ceil(UNDO_WINDOW_MS / 1000));

    undoIntervalRef.current = window.setInterval(() => {
      setUndoSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    undoTimerRef.current = window.setTimeout(() => {
      pendingSendRef.current?.();
      pendingSendRef.current = null;
      setUndoSecondsLeft(0);
      if (undoIntervalRef.current) window.clearInterval(undoIntervalRef.current);
    }, UNDO_WINDOW_MS);
  }, []);

  const cancelPendingSend = useCallback(() => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    if (undoIntervalRef.current) window.clearInterval(undoIntervalRef.current);
    pendingSendRef.current = null;
    setUndoSecondsLeft(0);
  }, []);

  useEffect(
    () => () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      if (undoIntervalRef.current) window.clearInterval(undoIntervalRef.current);
    },
    [],
  );

  const notifyAgentTyping = useCallback((isTyping: boolean) => {
    setAgentTyping(isTyping);
  }, []);

  return useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      activeMatchIndex,
      setActiveMatchIndex,
      bookmarksOnly,
      setBookmarksOnly,
      starredIds,
      toggleStar,
      getReaction,
      toggleReaction,
      conversationFlags,
      toggleConversationBookmark,
      typingActor,
      presence,
      notifyAgentTyping,
      undoSecondsLeft,
      scheduleSendWithUndo,
      cancelPendingSend,
    }),
    [
      searchQuery,
      activeMatchIndex,
      bookmarksOnly,
      starredIds,
      toggleStar,
      getReaction,
      toggleReaction,
      conversationFlags,
      toggleConversationBookmark,
      typingActor,
      presence,
      notifyAgentTyping,
      undoSecondsLeft,
      scheduleSendWithUndo,
      cancelPendingSend,
    ],
  );
}

export function findSearchMatches(messages: Array<{ id: string; body: string }>, query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return messages.filter((message) => message.body.toLowerCase().includes(trimmed)).map((message) => message.id);
}

export function highlightSearchText(text: string, query: string): Array<{ text: string; highlight: boolean }> {
  const trimmed = query.trim();
  if (!trimmed) return [{ text, highlight: false }];
  const lower = text.toLowerCase();
  const needle = trimmed.toLowerCase();
  const index = lower.indexOf(needle);
  if (index < 0) return [{ text, highlight: false }];
  return [
    { text: text.slice(0, index), highlight: false },
    { text: text.slice(index, index + trimmed.length), highlight: true },
    { text: text.slice(index + trimmed.length), highlight: false },
  ].filter((part) => part.text.length > 0);
}
