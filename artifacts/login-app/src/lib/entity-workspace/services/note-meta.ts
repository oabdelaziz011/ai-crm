import type {
  EntityNoteMention,
  EntityNoteVisibility,
  EntityWorkspaceModuleId,
} from "../types";

export const ENTITY_NOTE_META_KIND = "entity_note" as const;

export type EntityNoteMeta = {
  kind: typeof ENTITY_NOTE_META_KIND;
  operationId?: string | null;
  createdByRole?: string | null;
  department?: string | null;
  visibility?: EntityNoteVisibility;
  category?: string | null;
  title?: string | null;
  sourceModule?: EntityWorkspaceModuleId | string | null;
  pinned?: boolean;
  mentions?: readonly EntityNoteMention[];
};

export function normalizeNoteVisibility(value: string | null | undefined): EntityNoteVisibility {
  switch (value) {
    case "operations":
    case "crm":
    case "both":
      return value;
    case "internal":
      return "operations";
    case "restricted":
      return "crm";
    case "shared":
    default:
      return "both";
  }
}

function parseMentions(raw: unknown): EntityNoteMention[] {
  if (!Array.isArray(raw)) return [];
  const out: EntityNoteMention[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const userId = rec.userId == null ? null : String(rec.userId);
    const handle = rec.handle == null ? null : String(rec.handle);
    const label = rec.label == null ? null : String(rec.label);
    if (!userId || !handle || !label) continue;
    out.push({
      userId,
      handle,
      label,
      targetType: rec.targetType === "team" ? "team" : "agent",
    });
  }
  return out;
}

export function encodeNoteMeta(meta: Omit<EntityNoteMeta, "kind">): Record<string, unknown> {
  return {
    kind: ENTITY_NOTE_META_KIND,
    operationId: meta.operationId ?? null,
    createdByRole: meta.createdByRole ?? null,
    department: meta.department ?? null,
    visibility: normalizeNoteVisibility(meta.visibility ?? "both"),
    category: meta.category ?? null,
    title: meta.title ?? null,
    sourceModule: meta.sourceModule ?? null,
    pinned: Boolean(meta.pinned),
    mentions: (meta.mentions ?? []).map((mention) => ({
      userId: mention.userId,
      handle: mention.handle,
      label: mention.label,
      targetType: mention.targetType,
    })),
  };
}

export function decodeNoteMeta(
  attachments: readonly Readonly<Record<string, unknown>>[] | null | undefined,
): EntityNoteMeta | null {
  const hit = (attachments ?? []).find((item) => item.kind === ENTITY_NOTE_META_KIND);
  if (!hit) return null;
  return {
    kind: ENTITY_NOTE_META_KIND,
    operationId: hit.operationId == null ? null : String(hit.operationId),
    createdByRole: hit.createdByRole == null ? null : String(hit.createdByRole),
    department: hit.department == null ? null : String(hit.department),
    visibility: normalizeNoteVisibility(
      hit.visibility == null ? "both" : String(hit.visibility),
    ),
    category: hit.category == null ? null : String(hit.category),
    title: hit.title == null ? null : String(hit.title),
    sourceModule: hit.sourceModule == null ? null : String(hit.sourceModule),
    pinned: Boolean(hit.pinned),
    mentions: parseMentions(hit.mentions),
  };
}

/** Patch note meta inside an activity attachments array (preserves non-meta entries). */
export function patchNoteMetaAttachments(
  attachments: readonly Readonly<Record<string, unknown>>[] | null | undefined,
  patch: Partial<Omit<EntityNoteMeta, "kind">>,
): Record<string, unknown>[] {
  const list = [...(attachments ?? [])].map((item) => ({ ...item }));
  const index = list.findIndex((item) => item.kind === ENTITY_NOTE_META_KIND);
  const current = decodeNoteMeta(attachments);
  const next = encodeNoteMeta({
    operationId: patch.operationId ?? current?.operationId ?? null,
    createdByRole: patch.createdByRole ?? current?.createdByRole ?? null,
    department: patch.department ?? current?.department ?? null,
    visibility: patch.visibility ?? current?.visibility ?? "both",
    category: patch.category ?? current?.category ?? null,
    title: patch.title ?? current?.title ?? null,
    sourceModule: patch.sourceModule ?? current?.sourceModule ?? null,
    pinned: patch.pinned ?? current?.pinned ?? false,
    mentions: patch.mentions ?? current?.mentions ?? [],
  });
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  return list;
}

/** Whether a note should appear in the given module surface. */
export function noteVisibleInModule(
  visibility: EntityNoteVisibility,
  moduleId: EntityWorkspaceModuleId | string,
): boolean {
  const normalized = normalizeNoteVisibility(visibility);
  if (normalized === "both") return true;
  if (moduleId === "operations") return normalized === "operations";
  if (moduleId === "crm") return normalized === "crm";
  return true;
}

export function compareEntityNotesNewestFirst(
  a: { pinned: boolean; createdAt: string; id: string },
  b: { pinned: boolean; createdAt: string; id: string },
): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.createdAt === b.createdAt) return b.id.localeCompare(a.id);
  return a.createdAt < b.createdAt ? 1 : -1;
}
