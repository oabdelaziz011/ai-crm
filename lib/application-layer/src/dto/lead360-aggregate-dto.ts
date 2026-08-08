import type { TimelineItemDto } from "./query-dtos.js";
import type { LeadReadModel } from "../ports/repository-ports.js";
import type { LeadAiAuditEntry, LeadAiStatusDto } from "../lead-intelligence/capture-types.js";

export type Lead360ActivityItemDto = Readonly<{
  id: string;
  channel: string;
  subject: string;
  occurredAt: string;
  preview: string | null;
  actor: string | null;
  outcome: string | null;
}>;

export type Lead360FileDto = Readonly<{
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  previewUrl: string | null;
}>;

export type Lead360TaskDto = Readonly<{
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  assignee: string;
}>;

/** Lead360 consumes the same canonical LeadReadModel as the table. */
export type Lead360AggregateDto = Readonly<{
  lead: LeadReadModel;
  activities: readonly Lead360ActivityItemDto[];
  tasks: readonly Lead360TaskDto[];
  files: readonly Lead360FileDto[];
  timeline: readonly TimelineItemDto[];
  /** Sprint 3.12.1 — Smart Capture foundation (no AI analysis yet). */
  aiStatus?: LeadAiStatusDto;
  aiAudit?: readonly LeadAiAuditEntry[];
}>;

export type Lead360AggregateRequestDto = Readonly<{
  leadId: string;
  pipelineId?: string;
  role?: string;
  visibleSections?: readonly string[];
}>;
