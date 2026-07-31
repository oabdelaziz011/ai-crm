import type { AiEmployeeRecord } from "./ai-employee-types";
import type { AiEmployeeLongTermMemoryEntry } from "./memory-types";

export type AiEmployeeGroupKey = "sales" | "support" | "booking" | "marketing" | string;

export type AiEmployeeHandoverStatus = "pending" | "accepted" | "completed" | "failed" | "cancelled";

export type AiEmployeeEscalationType = "ai_to_ai" | "ai_to_human" | "human_to_ai";

export type AiEmployeeCollaborationEventType =
  | "group_joined"
  | "group_left"
  | "handover_requested"
  | "handover_accepted"
  | "handover_completed"
  | "handover_failed"
  | "escalation_started"
  | "escalation_completed"
  | "assignment"
  | "completion";

export type AiEmployeeGroupRecord = {
  id: string;
  key: AiEmployeeGroupKey;
  name: string;
  displayName: string;
  description: string;
  department: string | null;
  tags: string[];
  memberIds: string[];
  memberCount: number;
};

export type AiEmployeeDirectoryEntry = {
  employee: AiEmployeeRecord;
  status: AiEmployeeRecord["status"];
  department: string | null;
  skillsSummary: string;
  toolSummary: string;
  healthScore: number;
  groupKeys: string[];
  capabilities: string[];
};

export type AiEmployeeHandoverRecord = {
  id: string;
  sourceEmployeeId: string;
  sourceDisplayName: string;
  destinationEmployeeId: string;
  destinationDisplayName: string;
  reason: string;
  status: AiEmployeeHandoverStatus;
  escalationType: AiEmployeeEscalationType;
  createdAt: string;
  completedAt: string | null;
};

export type AiEmployeeSharedContextEntry = {
  key: string;
  value: string;
  ownerEmployeeId: string | null;
  ownerDisplayName: string | null;
  scope: "session" | "workflow" | "tenant";
};

export type AiEmployeeSharedMemoryEntry = AiEmployeeLongTermMemoryEntry & {
  ownerEmployeeId: string;
  ownerDisplayName: string;
  scope: "private" | "group" | "tenant";
  permissions: string[];
};

export type AiEmployeeEscalationRecord = {
  id: string;
  type: AiEmployeeEscalationType;
  sourceLabel: string;
  destinationLabel: string;
  status: string;
  timestamp: string;
};

export type AiEmployeeCollaborationTimelineEntry = {
  id: string;
  eventType: AiEmployeeCollaborationEventType | "workflow" | "lifecycle";
  label: string;
  timestamp: string;
  metadata: Record<string, unknown>;
};

export type AiEmployeeCollaborationAnalytics = {
  collaborationCount: number;
  handoverSuccessRate: number;
  averageCompletionMs: number;
  averageResponseMs: number;
  failedTransfers: number;
};

export type AiEmployeeCollaborationPolicySnapshot = {
  allowedCollaborations: string[];
  blockedCollaborations: string[];
  departmentRules: Record<string, string[]>;
  tenantRules: Record<string, unknown>;
};

export type AiEmployeeCollaborationReadinessCategory = {
  id: "skills" | "permissions" | "knowledge" | "memory" | "lifecycle";
  label: string;
  ready: boolean;
  missing: string[];
};

export type AiEmployeeCollaborationReadinessScore = {
  score: number;
  ready: boolean;
  categories: AiEmployeeCollaborationReadinessCategory[];
};

export type AiEmployeeCollaborationSnapshot = {
  directory: AiEmployeeDirectoryEntry[];
  groups: AiEmployeeGroupRecord[];
  handovers: AiEmployeeHandoverRecord[];
  sharedContext: AiEmployeeSharedContextEntry[];
  sharedMemory: AiEmployeeSharedMemoryEntry[];
  escalations: AiEmployeeEscalationRecord[];
  timeline: AiEmployeeCollaborationTimelineEntry[];
  analytics: AiEmployeeCollaborationAnalytics;
  policies: AiEmployeeCollaborationPolicySnapshot;
  readiness: AiEmployeeCollaborationReadinessScore;
};

export type RequestAiEmployeeHandoverInput = {
  companyId: string;
  sourceEmployeeId: string;
  destinationEmployeeId: string;
  reason: string;
  escalationType?: AiEmployeeEscalationType;
  actorId?: string | null;
};
