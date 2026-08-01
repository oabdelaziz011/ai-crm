import type { ConversationRecord } from "@workspace/ai-conversation";
import type { LifecycleMetadataOverlay } from "../types/lifecycle-types.js";
import {
  readLifecycleOverlay,
  resolveLifecycleState,
  writeLifecycleOverlay,
} from "../adapters/backend-state-adapter.js";
import { resolveConversationOwner } from "../engines/ownership-engine.js";
import { getActiveEscalation } from "../engines/escalation-engine.js";
import type { LifecycleContext } from "../types/lifecycle-types.js";

export const LIFECYCLE_MIGRATION_VERSION = 1;

export function buildLifecycleContextFromRecord(record: ConversationRecord): LifecycleContext {
  const hasActiveEscalation = getActiveEscalation(record.metadata) != null;
  return {
    conversationId: record.id,
    backendState: record.state,
    assignedUserId: record.assigned_user_id,
    aiAssistantId: record.ai_assistant_id,
    metadata: record.metadata ?? {},
    hasActiveEscalation,
    lastParticipantType: record.last_participant_type,
    activeQueueId: readLifecycleOverlay(record.metadata)?.queueId ?? null,
  };
}

export function needsLifecycleMetadataMigration(record: ConversationRecord): boolean {
  const overlay = readLifecycleOverlay(record.metadata);
  if (!overlay) return true;
  if (overlay.migrationVersion == null && overlay.migratedAt == null && overlay.state == null) {
    return true;
  }
  return false;
}

export function buildMigratableLifecycleOverlay(record: ConversationRecord): LifecycleMetadataOverlay {
  const context = buildLifecycleContextFromRecord(record);
  const state = resolveLifecycleState(context);
  const owner = resolveConversationOwner(context);

  return {
    state,
    owner,
    queueId: null,
    tags: Array.isArray(record.metadata?.tags)
      ? (record.metadata.tags as string[])
      : undefined,
    migratedAt: new Date().toISOString(),
    migrationVersion: LIFECYCLE_MIGRATION_VERSION,
    assignmentHistory: [],
    escalations: [],
    timelineEvents: [],
  };
}

export function migrateLifecycleMetadata(record: ConversationRecord): Record<string, unknown> {
  const base = record.metadata ?? {};
  if (!needsLifecycleMetadataMigration(record)) return base;
  const overlay = buildMigratableLifecycleOverlay(record);
  return writeLifecycleOverlay(base, overlay);
}

export function isLifecycleMigrated(metadata: Record<string, unknown>): boolean {
  const overlay = readLifecycleOverlay(metadata);
  return overlay?.migrationVersion != null || overlay?.migratedAt != null;
}
