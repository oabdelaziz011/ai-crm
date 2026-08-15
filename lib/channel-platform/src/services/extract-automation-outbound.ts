import type { ChannelAttachmentDto } from "../dto/channel-dto.js";

export type AutomationResponseSource = {
  lifecycle: string;
  variables: Record<string, unknown>;
};

export type OutboundQueueEntry = {
  kind: string;
  text?: string;
  body?: string;
  title?: string;
  buttonLabel?: string;
  url?: string;
  mediaType?: string;
  caption?: string;
  mimeType?: string;
  buttons?: Array<{ id: string; label: string }>;
  sections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  [key: string]: unknown;
};

const OUTBOUND_QUEUE_VARIABLE = "__outboundQueue";
const OUTBOUND_LEGACY_VARIABLE = "__outbound";

function isOutboundEntry(value: unknown): value is OutboundQueueEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof (value as OutboundQueueEntry).kind === "string";
}

function readOutboundQueue(variables: Record<string, unknown>): OutboundQueueEntry[] {
  const raw = variables[OUTBOUND_QUEUE_VARIABLE];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isOutboundEntry);
}

function readLatestOutbound(variables: Record<string, unknown>): OutboundQueueEntry | null {
  const queue = readOutboundQueue(variables);
  if (queue.length > 0) return queue[queue.length - 1] ?? null;
  const legacy = variables[OUTBOUND_LEGACY_VARIABLE];
  return isOutboundEntry(legacy) ? legacy : null;
}

function outboundEntryDisplayText(entry: OutboundQueueEntry): string {
  if (entry.kind === "list") {
    const body = typeof entry.body === "string" ? entry.body.trim() : "";
    if (body) return body;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    return title;
  }

  if (entry.kind === "image" || entry.kind === "media") {
    const caption = typeof entry.caption === "string" ? entry.caption.trim() : "";
    if (caption) return caption;
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    return text;
  }

  const text = typeof entry.text === "string" ? entry.text.trim() : "";
  return text;
}

export type AutomationOutboundDispatchMessage = {
  text: string;
  payload?: Record<string, unknown>;
  attachments?: ChannelAttachmentDto[];
};

function entryToAttachments(entry: OutboundQueueEntry): ChannelAttachmentDto[] | undefined {
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  if (!url) return undefined;

  const mediaType =
    entry.kind === "image" || entry.mediaType === "image"
      ? "image"
      : entry.kind === "video" || entry.mediaType === "video"
        ? "video"
        : entry.kind === "audio" || entry.mediaType === "audio"
          ? "audio"
          : entry.kind === "document" || entry.mediaType === "document"
            ? "document"
            : "image";

  return [
    {
      attachmentId: url,
      type: mediaType,
      url,
      mimeType: typeof entry.mimeType === "string" ? entry.mimeType : undefined,
      caption: outboundEntryDisplayText(entry) || undefined,
    },
  ];
}

function entryToDispatchMessage(entry: OutboundQueueEntry): AutomationOutboundDispatchMessage | null {
  const text = outboundEntryDisplayText(entry);
  const attachments = entryToAttachments(entry);

  if (!text && !attachments?.length) return null;

  const payload = { ...entry };
  return {
    text: text || attachments?.[0]?.caption?.trim() || " ",
    payload,
    attachments,
  };
}

export function extractAutomationOutboundMessages(
  result: AutomationResponseSource,
): AutomationOutboundDispatchMessage[] {
  const messages: AutomationOutboundDispatchMessage[] = [];

  const queue = readOutboundQueue(result.variables);
  if (queue.length > 0) {
    for (const entry of queue) {
      const message = entryToDispatchMessage(entry);
      if (message) messages.push(message);
    }
  } else {
    const legacy = readLatestOutbound(result.variables);
    if (legacy) {
      // Structured outbound from interactive nodes is only meaningful while waiting,
      // or when a completed turn intentionally left queue/legacy text to send.
      // For failed runs, prefer not to replay a prior interactive payload.
      if (
        result.lifecycle === "waiting_input" ||
        result.lifecycle === "completed" ||
        result.lifecycle === "running"
      ) {
        const message = entryToDispatchMessage(legacy);
        if (message) messages.push(message);
      }
    }
  }

  // Ask/wait prompts are stored in __prompt and are often set AFTER earlier nodes
  // already queued welcome/send_message text. Include the prompt while waiting
  // unless it is already the last queued outbound text.
  // Never replay __prompt after leaving waiting_input (e.g. failed later node).
  if (result.lifecycle === "waiting_input") {
    const prompt = result.variables.__prompt;
    if (typeof prompt === "string" && prompt.trim()) {
      const trimmed = prompt.trim();
      const lastText = messages[messages.length - 1]?.text?.trim() ?? "";
      if (lastText !== trimmed) {
        messages.push({ text: trimmed, payload: { kind: "automation_prompt" } });
      }
    }
  }

  if (messages.length > 0) return messages;

  const lastMessage = result.variables.lastMessage;
  if (typeof lastMessage === "string" && lastMessage.trim() && result.lifecycle === "completed") {
    return [{ text: lastMessage.trim(), payload: { kind: "automation_echo" } }];
  }

  return [];
}

export function extractAutomationResponseContent(result: AutomationResponseSource): string | null {
  const messages = extractAutomationOutboundMessages(result);
  if (messages.length > 0) {
    return messages[messages.length - 1]?.text?.trim() ?? null;
  }
  return null;
}
