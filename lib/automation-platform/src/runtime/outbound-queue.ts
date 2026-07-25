export const OUTBOUND_QUEUE_VARIABLE = "__outboundQueue";

/** Legacy single-slot variable — kept in sync with the latest queued entry. */
export const OUTBOUND_LEGACY_VARIABLE = "__outbound";

export type OutboundMessageKind = "text" | "buttons" | "list" | "image" | "media" | "template";

export type OutboundQueueEntry = {
  kind: OutboundMessageKind | string;
  text?: string;
  body?: string;
  title?: string;
  buttonLabel?: string;
  buttons?: Array<{ id: string; label: string }>;
  sections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  url?: string;
  mediaType?: string;
  caption?: string;
  mimeType?: string;
  templateKey?: string;
  language?: string;
  variables?: Record<string, unknown>;
  [key: string]: unknown;
};

function isOutboundEntry(value: unknown): value is OutboundQueueEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof (value as OutboundQueueEntry).kind === "string";
}

export function readOutboundQueue(variables: Record<string, unknown>): OutboundQueueEntry[] {
  const raw = variables[OUTBOUND_QUEUE_VARIABLE];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isOutboundEntry);
}

export function readLatestOutbound(variables: Record<string, unknown>): OutboundQueueEntry | null {
  const queue = readOutboundQueue(variables);
  if (queue.length > 0) return queue[queue.length - 1] ?? null;

  const legacy = variables[OUTBOUND_LEGACY_VARIABLE];
  return isOutboundEntry(legacy) ? legacy : null;
}

export function resetOutboundQueue(variables: Record<string, unknown>): Record<string, unknown> {
  return {
    ...variables,
    [OUTBOUND_QUEUE_VARIABLE]: [],
  };
}

export function appendOutboundQueueEntry(
  variables: Record<string, unknown>,
  entry: OutboundQueueEntry,
): Record<string, unknown> {
  const queue = [...readOutboundQueue(variables), entry];
  return {
    ...variables,
    [OUTBOUND_QUEUE_VARIABLE]: queue,
    [OUTBOUND_LEGACY_VARIABLE]: entry,
  };
}

export function clearLatestOutboundSlot(): Record<string, unknown> {
  return { [OUTBOUND_LEGACY_VARIABLE]: null };
}

export function outboundEntryDisplayText(entry: OutboundQueueEntry): string {
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
