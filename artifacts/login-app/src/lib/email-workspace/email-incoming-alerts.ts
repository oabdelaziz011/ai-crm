/**
 * Email Workspace inbound alerts — reuses desk notification sound preference.
 * Message-id baseline/dedup so initial load, refetch, remount, and reconnect
 * do not replay sound for historical or already-seen inbound emails.
 */
import {
  isDeskSoundEnabled,
  playDeskNotificationSound,
} from "@/lib/omnichannel/presentation/desk-notification-sound";

export type EmailIncomingAlertResult =
  | "ignored_missing_id"
  | "ignored_duplicate"
  | "baseline_recorded"
  | "skipped_focused"
  | "skipped_muted"
  | "played";

/** Indirection so focused tests can stub without AudioContext. */
export const emailIncomingSoundAdapters = {
  isEnabled: (): boolean => isDeskSoundEnabled(),
  play: (): void => {
    playDeskNotificationSound();
  },
};

const seenInboundMessageIds = new Set<string>();
let baselineReady = false;
let playCount = 0;
let lastPlayedMessageId: string | null = null;

export function isEmailInboundAlertBaselineReady(): boolean {
  return baselineReady;
}

/** Call after the first Email Workspace list sync so historical rows never chime. */
export function markEmailInboundAlertBaselineReady(): void {
  baselineReady = true;
  publishEmailIncomingAlertDebug();
}

export function rememberEmailInboundMessageIds(messageIds: Iterable<string>): void {
  for (const id of messageIds) {
    const trimmed = String(id ?? "").trim();
    if (trimmed) seenInboundMessageIds.add(trimmed);
  }
}

export function hasSeenEmailInboundMessageId(messageId: string): boolean {
  return seenInboundMessageIds.has(messageId.trim());
}

/**
 * Record a genuinely new inbound email message and optionally play the shared desk sound.
 * Always consumes the message id (even when muted/focused/pre-baseline) so later
 * refetches/reconnects cannot replay the same event.
 */
export function notifyEmailIncomingMessageAlert(input: {
  messageId: string;
  conversationId: string;
  focusedConversationId?: string | null;
}): EmailIncomingAlertResult {
  const messageId = String(input.messageId ?? "").trim();
  const conversationId = String(input.conversationId ?? "").trim();
  if (!messageId || !conversationId) return "ignored_missing_id";
  if (seenInboundMessageIds.has(messageId)) return "ignored_duplicate";
  seenInboundMessageIds.add(messageId);

  if (!baselineReady) return "baseline_recorded";

  const focused = input.focusedConversationId?.trim() || null;
  if (focused && focused === conversationId) return "skipped_focused";

  if (!emailIncomingSoundAdapters.isEnabled()) return "skipped_muted";

  emailIncomingSoundAdapters.play();
  playCount += 1;
  lastPlayedMessageId = messageId;
  publishEmailIncomingAlertDebug();
  return "played";
}

export function getEmailIncomingAlertDebugState(): {
  baselineReady: boolean;
  seenCount: number;
  playCount: number;
  lastPlayedMessageId: string | null;
} {
  return {
    baselineReady,
    seenCount: seenInboundMessageIds.size,
    playCount,
    lastPlayedMessageId,
  };
}

/** Test/E2E only — resets module state between scenarios. */
export function resetEmailIncomingAlertsForTests(): void {
  seenInboundMessageIds.clear();
  baselineReady = false;
  playCount = 0;
  lastPlayedMessageId = null;
  publishEmailIncomingAlertDebug();
}

function publishEmailIncomingAlertDebug(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    __EMAIL_INBOUND_ALERTS__?: {
      get baselineReady(): boolean;
      get seenCount(): number;
      get playCount(): number;
      get lastPlayedMessageId(): string | null;
      snapshot: () => ReturnType<typeof getEmailIncomingAlertDebugState>;
      reset: () => void;
    };
  };
  // Live getters so E2E/CDP never reads a stale snapshot after baseline mark.
  w.__EMAIL_INBOUND_ALERTS__ = {
    get baselineReady() {
      return baselineReady;
    },
    get seenCount() {
      return seenInboundMessageIds.size;
    },
    get playCount() {
      return playCount;
    },
    get lastPlayedMessageId() {
      return lastPlayedMessageId;
    },
    snapshot: () => getEmailIncomingAlertDebugState(),
    reset: resetEmailIncomingAlertsForTests,
  };
}

publishEmailIncomingAlertDebug();
