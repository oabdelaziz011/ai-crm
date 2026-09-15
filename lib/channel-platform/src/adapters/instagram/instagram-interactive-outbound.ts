import type { OutboundChannelMessageDto } from "../../dto/channel-dto.js";
import type { InstagramSendMessagePayload } from "./instagram-types.js";

export const INSTAGRAM_QUICK_REPLY_TITLE_MAX = 20;
export const INSTAGRAM_QUICK_REPLY_MAX = 13;
export const INSTAGRAM_GENERIC_BUTTON_MAX = 3;
export const INSTAGRAM_GENERIC_TITLE_MAX = 80;

type InteractiveButton = { id?: unknown; label?: unknown };
type InteractiveRow = { id?: unknown; title?: unknown };
type InteractiveSection = { rows?: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readStructuredPayload(message: OutboundChannelMessageDto): Record<string, unknown> | null {
  return asRecord(message.metadata?.outboundPayload);
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function readButtons(structured: Record<string, unknown>): Array<{ id: string; title: string }> {
  if (!Array.isArray(structured.buttons)) return [];
  const buttons: Array<{ id: string; title: string }> = [];
  for (const raw of structured.buttons as InteractiveButton[]) {
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    const title = typeof raw?.label === "string" ? clip(raw.label, INSTAGRAM_QUICK_REPLY_TITLE_MAX) : "";
    if (!id || !title) continue;
    buttons.push({ id, title });
    if (buttons.length >= INSTAGRAM_GENERIC_BUTTON_MAX) break;
  }
  return buttons;
}

function readListRows(structured: Record<string, unknown>): Array<{ id: string; title: string }> {
  if (!Array.isArray(structured.sections)) return [];
  const rows: Array<{ id: string; title: string }> = [];
  for (const rawSection of structured.sections as InteractiveSection[]) {
    const section = asRecord(rawSection);
    const sectionRows = Array.isArray(section?.rows) ? section.rows : [];
    for (const rawRow of sectionRows as InteractiveRow[]) {
      const id = typeof rawRow?.id === "string" ? rawRow.id.trim() : "";
      const title = typeof rawRow?.title === "string" ? clip(rawRow.title, INSTAGRAM_QUICK_REPLY_TITLE_MAX) : "";
      if (!id || !title) continue;
      rows.push({ id, title });
      if (rows.length >= INSTAGRAM_QUICK_REPLY_MAX) return rows;
    }
  }
  return rows;
}

function listPromptText(message: OutboundChannelMessageDto, structured: Record<string, unknown>): string {
  const body = typeof structured.body === "string" ? structured.body.trim() : "";
  if (body) return body;
  const title = typeof structured.title === "string" ? structured.title.trim() : "";
  if (title) return title;
  return message.text.trim();
}

function buttonPromptText(message: OutboundChannelMessageDto, structured: Record<string, unknown>): string {
  const text = typeof structured.text === "string" ? structured.text.trim() : "";
  return text || message.text.trim();
}

/**
 * Instagram DMs do not support WhatsApp interactive lists.
 * Map send_list → quick replies (chips) and send_buttons → generic template postbacks.
 */
export function formatInstagramInteractiveOutbound(
  message: OutboundChannelMessageDto,
): InstagramSendMessagePayload | null {
  const structured = readStructuredPayload(message);
  const kind = typeof structured?.kind === "string" ? structured.kind : null;
  if (!structured || !kind) return null;

  if (kind === "list") {
    const rows = readListRows(structured);
    const text = listPromptText(message, structured);
    if (!text || rows.length === 0) return null;
    return {
      recipient: { id: message.externalThreadId },
      message: {
        text,
        quick_replies: rows.map((row) => ({
          content_type: "text" as const,
          title: row.title,
          payload: row.id,
        })),
      },
    };
  }

  if (kind === "buttons") {
    const buttons = readButtons(structured);
    const text = buttonPromptText(message, structured);
    if (!text || buttons.length === 0) return null;
    return {
      recipient: { id: message.externalThreadId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [
              {
                title: clip(text, INSTAGRAM_GENERIC_TITLE_MAX),
                buttons: buttons.map((button) => ({
                  type: "postback",
                  title: button.title,
                  payload: button.id,
                })),
              },
            ],
          },
        },
      },
    };
  }

  return null;
}
