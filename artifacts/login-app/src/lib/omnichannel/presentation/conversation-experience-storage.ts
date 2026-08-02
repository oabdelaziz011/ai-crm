const PREFIX = "omnichannel-experience:";

type ConversationFlags = {
  pinned?: boolean;
  starred?: boolean;
  following?: boolean;
  markedUnread?: boolean;
};

type ExperienceStore = {
  starredMessages: Record<string, string[]>;
  reactions: Record<string, Record<string, string>>;
  conversationFlags: Record<string, ConversationFlags>;
};

function readStore(): ExperienceStore {
  try {
    const raw = localStorage.getItem(`${PREFIX}v1`);
    if (!raw) {
      return { starredMessages: {}, reactions: {}, conversationFlags: {} };
    }
    return JSON.parse(raw) as ExperienceStore;
  } catch {
    return { starredMessages: {}, reactions: {}, conversationFlags: {} };
  }
}

function writeStore(store: ExperienceStore): void {
  localStorage.setItem(`${PREFIX}v1`, JSON.stringify(store));
}

export function getStarredMessageIds(conversationId: string): Set<string> {
  const store = readStore();
  return new Set(store.starredMessages[conversationId] ?? []);
}

export function toggleStarredMessage(conversationId: string, messageId: string): boolean {
  const store = readStore();
  const current = new Set(store.starredMessages[conversationId] ?? []);
  if (current.has(messageId)) current.delete(messageId);
  else current.add(messageId);
  store.starredMessages[conversationId] = [...current];
  writeStore(store);
  return current.has(messageId);
}

export function getMessageReaction(conversationId: string, messageId: string): string | null {
  const store = readStore();
  return store.reactions[conversationId]?.[messageId] ?? null;
}

export function setMessageReaction(
  conversationId: string,
  messageId: string,
  emoji: string | null,
): void {
  const store = readStore();
  if (!store.reactions[conversationId]) store.reactions[conversationId] = {};
  if (emoji) store.reactions[conversationId]![messageId] = emoji;
  else delete store.reactions[conversationId]![messageId];
  writeStore(store);
}

export function getConversationFlags(conversationId: string): ConversationFlags {
  return readStore().conversationFlags[conversationId] ?? {};
}

export function toggleConversationFlag(
  conversationId: string,
  flag: keyof ConversationFlags,
): ConversationFlags {
  const store = readStore();
  const current = store.conversationFlags[conversationId] ?? {};
  current[flag] = !current[flag];
  store.conversationFlags[conversationId] = current;
  writeStore(store);
  return current;
}
