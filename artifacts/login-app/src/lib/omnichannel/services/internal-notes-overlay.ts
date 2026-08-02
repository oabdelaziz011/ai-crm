import type { UnifiedMessage } from "@/lib/omnichannel/types/unified-conversation";

export const INTERNAL_NOTES_OVERLAY_KEY = "internalNotesOverlay";

export type InternalNoteHistoryEntry = {
  body: string;
  editedAt: string;
  editedBy: string | null;
  editedByLabel: string | null;
};

export type InternalNoteOverlayEntry = {
  deleted?: boolean;
  body?: string;
  editedAt?: string;
  editedBy?: string | null;
  editedByLabel?: string | null;
  history?: InternalNoteHistoryEntry[];
};

export type InternalNotesOverlay = Record<string, InternalNoteOverlayEntry>;

export function readInternalNotesOverlay(
  metadata: Record<string, unknown> | null | undefined,
): InternalNotesOverlay {
  const raw = metadata?.[INTERNAL_NOTES_OVERLAY_KEY];
  if (!raw || typeof raw !== "object") return {};
  return raw as InternalNotesOverlay;
}

export function writeInternalNotesOverlay(
  metadata: Record<string, unknown>,
  overlay: InternalNotesOverlay,
): Record<string, unknown> {
  return { ...metadata, [INTERNAL_NOTES_OVERLAY_KEY]: overlay };
}

export function applyInternalNotesOverlay(
  notes: UnifiedMessage[],
  overlay: InternalNotesOverlay,
): UnifiedMessage[] {
  return notes
    .map((note) => {
      const entry = overlay[note.id];
      if (!entry) return note;
      if (entry.deleted) return null;
      if (!entry.body) return note;
      return {
        ...note,
        body: entry.body,
        source: {
          ...note.source,
          metadata: {
            ...(note.source.metadata ?? {}),
            editedAt: entry.editedAt,
            editedBy: entry.editedBy,
            editedByLabel: entry.editedByLabel,
            noteHistory: entry.history,
          },
        },
      };
    })
    .filter((note): note is UnifiedMessage => note !== null);
}

export function buildEditedNoteOverlay(
  current: InternalNotesOverlay,
  messageId: string,
  originalBody: string,
  nextBody: string,
  actor: { id: string | null; label: string | null },
): InternalNotesOverlay {
  const existing = current[messageId] ?? {};
  const history = existing.history ?? [];
  if (existing.body && existing.body !== nextBody) {
    history.push({
      body: existing.body,
      editedAt: existing.editedAt ?? new Date().toISOString(),
      editedBy: existing.editedBy ?? null,
      editedByLabel: existing.editedByLabel ?? null,
    });
  } else if (!existing.body && originalBody !== nextBody) {
    history.push({
      body: originalBody,
      editedAt: new Date().toISOString(),
      editedBy: null,
      editedByLabel: null,
    });
  }

  return {
    ...current,
    [messageId]: {
      ...existing,
      body: nextBody,
      editedAt: new Date().toISOString(),
      editedBy: actor.id,
      editedByLabel: actor.label,
      history,
      deleted: false,
    },
  };
}

export function buildDeletedNoteOverlay(
  current: InternalNotesOverlay,
  messageId: string,
): InternalNotesOverlay {
  return {
    ...current,
    [messageId]: {
      ...(current[messageId] ?? {}),
      deleted: true,
    },
  };
}
