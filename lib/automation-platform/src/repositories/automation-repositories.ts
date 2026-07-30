import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
  AutomationRunRecord,
  ConversationMessageRecord,
  ConversationSessionRecord,
  CreateAutomationEdgeInput,
  CreateAutomationFlowInput,
  CreateAutomationNodeInput,
  CreateAutomationRunInput,
  CreateConversationMessageInput,
  CreateConversationSessionInput,
  ListAutomationFlowsFilter,
  ListAutomationRunsFilter,
  ListConversationMessagesFilter,
  ListConversationSessionsFilter,
  SoftDeleteInput,
  UpdateAutomationFlowInput,
  UpdateAutomationRunStateInput,
  UpdateConversationSessionStateInput,
} from "../types.js";
import type { AutomationChannel } from "../constants.js";

export interface AutomationFlowRepository {
  create(input: CreateAutomationFlowInput): Promise<AutomationFlowRecord>;
  update(input: UpdateAutomationFlowInput): Promise<AutomationFlowRecord>;
  updateStatus(flowId: string, status: AutomationFlowRecord["status"], updatedBy?: string | null): Promise<AutomationFlowRecord>;
  softDelete(input: SoftDeleteInput): Promise<AutomationFlowRecord>;
  findById(id: string): Promise<AutomationFlowRecord | null>;
  findByName(companyId: string, name: string): Promise<AutomationFlowRecord | null>;
  list(filter: ListAutomationFlowsFilter): Promise<AutomationFlowRecord[]>;
}

export interface AutomationNodeRepository {
  create(input: CreateAutomationNodeInput): Promise<AutomationNodeRecord>;
  listByFlowId(flowId: string): Promise<AutomationNodeRecord[]>;
  deleteByFlowId(flowId: string): Promise<void>;
}

export interface AutomationEdgeRepository {
  create(input: CreateAutomationEdgeInput): Promise<AutomationEdgeRecord>;
  listByFlowId(flowId: string): Promise<AutomationEdgeRecord[]>;
  deleteByFlowId(flowId: string): Promise<void>;
}

export interface AutomationRunRepository {
  create(input: CreateAutomationRunInput): Promise<AutomationRunRecord>;
  findById(id: string): Promise<AutomationRunRecord | null>;
  findBySessionId(sessionId: string): Promise<AutomationRunRecord | null>;
  findLatestResumableForExternalUser?(input: {
    companyId: string;
    channel: AutomationChannel;
    externalUserId: string;
    boundFlowId: string;
    activitySince: string;
  }): Promise<{ session: ConversationSessionRecord; run: AutomationRunRecord } | null>;
  list(filter: ListAutomationRunsFilter): Promise<AutomationRunRecord[]>;
  updateState(input: UpdateAutomationRunStateInput): Promise<AutomationRunRecord>;
}

export interface ConversationSessionRepository {
  create(input: CreateConversationSessionInput): Promise<ConversationSessionRecord>;
  findById(id: string): Promise<ConversationSessionRecord | null>;
  findActiveSession(input: {
    companyId: string;
    channel: AutomationChannel;
    externalUserId: string;
    preferStatus?: ConversationSessionRecord["status"];
    activitySince?: string;
  }): Promise<ConversationSessionRecord | null>;
  list(filter: ListConversationSessionsFilter): Promise<ConversationSessionRecord[]>;
  updateState(input: UpdateConversationSessionStateInput): Promise<ConversationSessionRecord>;
}

export interface ConversationMessageRepository {
  create(input: CreateConversationMessageInput): Promise<ConversationMessageRecord>;
  list(filter: ListConversationMessagesFilter): Promise<ConversationMessageRecord[]>;
}
