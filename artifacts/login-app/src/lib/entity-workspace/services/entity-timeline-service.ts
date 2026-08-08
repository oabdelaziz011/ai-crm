import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";
import { createLoginAppEntityActivityReadPort } from "@/lib/application-layer/adapters/entity-port-adapters";
import { supabase } from "@/lib/supabase";
import type {
  EntityAttachment,
  EntityNote,
  EntityTimelineEvent,
  EntityTimelineEventType,
} from "../types";
import { decodeNoteMeta } from "./note-meta";
import { createEntityAttachmentsService } from "./entity-attachments-service";
import { createEntityNotesService } from "./entity-notes-service";

function mapActivityType(activityType: string): EntityTimelineEventType {
  switch (activityType) {
    case "manual_note":
      return "note_added";
    case "booking":
      return "booking_created";
    case "invoice":
      return "invoice_created";
    case "payment":
      return "payment_collected";
    case "email":
    case "whatsapp":
    case "sms":
    case "call":
      return "communication_sent";
    case "task":
      return "task_completed";
    case "workflow":
      return "status_changed";
    default:
      return "activity";
  }
}

type ActivityRow = {
  id: string;
  entityId: string;
  entityType: string;
  activityType: string;
  subject: string;
  body: string | null;
  actorName: string | null;
  actorId: string | null;
  occurredAt: string;
  relatedEntityId: string | null;
  attachments: readonly Readonly<Record<string, unknown>>[] | null | undefined;
};

function extractChangeValues(attachments: ActivityRow["attachments"]): {
  oldValue: string | null;
  newValue: string | null;
} {
  for (const item of attachments ?? []) {
    const oldV = item.oldValue ?? item.old_value;
    const newV = item.newValue ?? item.new_value;
    if (oldV != null || newV != null) {
      return {
        oldValue: oldV == null ? null : String(oldV),
        newValue: newV == null ? null : String(newV),
      };
    }
  }
  return { oldValue: null, newValue: null };
}

/** Pure compose — host can reuse already-fetched notes/files (no duplicate queries). */
export function composeEntityTimeline(input: {
  activities: ActivityRow[];
  notes: EntityNote[];
  files: EntityAttachment[];
}): EntityTimelineEvent[] {
  const events: EntityTimelineEvent[] = [];

  for (const row of input.activities) {
    if (row.activityType === "manual_note") continue;
    const meta = decodeNoteMeta(row.attachments);
    const change = extractChangeValues(row.attachments);
    events.push({
      id: `activity:${row.id}`,
      entityId: row.entityId,
      entityType: row.entityType,
      eventType: mapActivityType(String(row.activityType)),
      title: row.subject,
      description: row.body,
      actor: row.actorName ?? row.actorId,
      actorId: row.actorId,
      role: meta?.createdByRole ?? null,
      department: meta?.department ?? null,
      timestamp: row.occurredAt,
      sourceModule: meta?.sourceModule ?? null,
      operationId: meta?.operationId ?? row.relatedEntityId,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });
  }

  for (const note of input.notes) {
    const attachmentCount = note.attachments.length;
    const actor = note.createdByName ?? note.createdBy ?? "Someone";
    const title =
      attachmentCount > 0 && !note.text.trim()
        ? `${actor} uploaded ${attachmentCount} file${attachmentCount === 1 ? "" : "s"}`
        : attachmentCount > 0
          ? "Note created"
          : `${actor} added a note`;
    events.push({
      id: `note:${note.id}`,
      entityId: note.entityId,
      entityType: note.entityType,
      eventType: "note_added",
      title,
      description: note.title?.trim() || note.text.slice(0, 120) || null,
      actor: note.createdByName ?? note.createdBy,
      actorId: note.createdBy,
      role: note.createdByRole,
      department: note.department,
      timestamp: note.createdAt,
      sourceModule: note.sourceModule,
      operationId: note.operationId,
      noteId: note.id,
      attachmentCount,
      oldValue: null,
      newValue: null,
    });
  }

  // Legacy orphan files only — note-linked files appear on the note event.
  for (const file of input.files) {
    if (file.activityId) continue;
    events.push({
      id: `file:${file.id}`,
      entityId: file.entityId,
      entityType: file.entityType,
      eventType: "attachment_uploaded",
      title: file.fileName,
      description: file.category,
      actor: file.uploadedBy,
      role: file.uploadedByRole,
      department: null,
      timestamp: file.uploadedAt,
      sourceModule: file.sourceModule,
      operationId: file.operationId,
      oldValue: null,
      newValue: null,
    });
  }

  return events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/**
 * ONE shared Timeline projection for CRM + Operations layouts.
 * Composes entity activities, notes, and attachments — layout differs by module.
 */
export function createEntityTimelineService(
  ctx: LoginAppPortContext,
  client: SupabaseClient = supabase,
) {
  const activityRead = createLoginAppEntityActivityReadPort(client, ctx);
  const notes = createEntityNotesService(ctx, client);
  const attachments = createEntityAttachmentsService(ctx, client);

  async function listActivities(entityType: string, entityId: string): Promise<ActivityRow[]> {
    const rows = await activityRead.list(ctx.companyId, entityType, entityId, { limit: 200 });
    return rows.map((row) => ({
      id: row.id,
      entityId: row.entityId,
      entityType: row.entityType,
      activityType: String(row.activityType),
      subject: row.subject,
      body: row.body,
      actorName: row.actorName,
      actorId: row.actorId,
      occurredAt: row.occurredAt,
      relatedEntityId: row.relatedEntityId ?? null,
      attachments: row.attachments,
    }));
  }

  return Object.freeze({
    listActivities,
    async list(
      entityType: string,
      entityId: string,
      preloaded?: { notes?: EntityNote[]; files?: EntityAttachment[] },
    ): Promise<EntityTimelineEvent[]> {
      const [activities, noteRows, fileRows] = await Promise.all([
        listActivities(entityType, entityId),
        preloaded?.notes
          ? Promise.resolve(preloaded.notes)
          : notes.list(entityType, entityId),
        preloaded?.files
          ? Promise.resolve(preloaded.files)
          : attachments.list(entityType, entityId),
      ]);

      return composeEntityTimeline({ activities, notes: noteRows, files: fileRows });
    },
  });
}

export type EntityTimelineService = ReturnType<typeof createEntityTimelineService>;
