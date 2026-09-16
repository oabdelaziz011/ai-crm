import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AssignmentGovernanceService,
  createAssignmentGovernancePort,
  createSupabaseAssignmentGovernanceDataPort,
} from "@workspace/assignment-governance";
import {
  AssignmentAuditService,
  createAssignmentAuditPort,
  createNoopAssignmentAuditPort,
  createSupabaseAssignmentAuditDataPort,
  type AssignmentAuditPort,
} from "@workspace/assignment-audit";
import { createSupabaseConversationRepository } from "./repositories/supabase-conversation-repository.js";
import { createSupabaseMessageRepository } from "./repositories/supabase-message-repository.js";
import { createSupabaseParticipantRepository } from "./repositories/supabase-participant-repository.js";
import { createSupabaseAssignmentTargetVisibilityPort } from "./repositories/supabase-assignment-target-visibility-port.js";
import {
  ConversationService,
  type ConversationLinkedTicketAssignmentSync,
  type ConversationPrioritySlaHook,
} from "./services/conversation-service.js";
import { MessageService } from "./services/message-service.js";
import { ConversationStateService } from "./services/conversation-state-service.js";
import { ParticipantService } from "./services/participant-service.js";
import type { AssignmentTargetVisibilityPort } from "./services/assignment-visibility-compatibility.js";

export type ConversationServices = {
  conversations: ConversationService;
  participants: ParticipantService;
  messages: MessageService;
  state: ConversationStateService;
};

export type CreateConversationServicesOptions = {
  /** When provided, priority updates recalculate lifecycle.slaDueAt atomically with priority. */
  prioritySlaHook?: ConversationPrioritySlaHook | null;
  /** When false, skip Assignment Governance (tests only). Default: enabled. */
  assignmentGovernance?: boolean | null;
  /** Sync linked support ticket assignee after human email conversation assignment. */
  linkedTicketAssignmentSync?: ConversationLinkedTicketAssignmentSync | null;
  /** When false, skip assignment audit (tests only). Default: enabled. */
  assignmentAudit?: boolean | AssignmentAuditPort | null;
  /**
   * Phase 6D Step 3 target visibility compatibility.
   * Default: enabled (Supabase authoritative loader).
   * Pass false/null to disable (tests / AI-only fixtures).
   */
  assignmentTargetVisibility?: boolean | AssignmentTargetVisibilityPort | null;
};

function createDefaultLinkedTicketAssignmentSync(
  client: SupabaseClient,
): ConversationLinkedTicketAssignmentSync {
  return {
    async syncAssignee(input) {
      const companyId = input.companyId.trim();
      const conversationId = input.conversationId.trim();
      const assignedUserId = input.assignedUserId.trim();
      if (!companyId || !conversationId || !assignedUserId) return;

      const { error } = await client
        .from("support_tickets")
        .update({
          assigned_user_id: assignedUserId,
          updated_at: new Date().toISOString(),
          updated_by: input.actorUserId,
        })
        .eq("company_id", companyId)
        .eq("conversation_id", conversationId)
        .is("deleted_at", null);
      if (error) {
        throw new Error(`Failed to sync linked ticket assignee: ${error.message}`);
      }
    },
  };
}

export function createConversationServices(
  client: SupabaseClient,
  options?: CreateConversationServicesOptions,
): ConversationServices {
  const conversationRepository = createSupabaseConversationRepository(client);
  const participantRepository = createSupabaseParticipantRepository(client);
  const messageRepository = createSupabaseMessageRepository(client);

  const governanceEnabled = options?.assignmentGovernance !== false;
  const assignmentGovernance = governanceEnabled
    ? createAssignmentGovernancePort(
        new AssignmentGovernanceService({
          port: createSupabaseAssignmentGovernanceDataPort(client),
        }),
      )
    : null;

  const linkedTicketAssignmentSync =
    options?.linkedTicketAssignmentSync === null
      ? null
      : (options?.linkedTicketAssignmentSync ?? createDefaultLinkedTicketAssignmentSync(client));

  const assignmentAudit: AssignmentAuditPort | null =
    options?.assignmentAudit === false
      ? null
      : typeof options?.assignmentAudit === "object" && options.assignmentAudit
        ? options.assignmentAudit
        : options?.assignmentAudit === null
          ? createNoopAssignmentAuditPort()
          : createAssignmentAuditPort(
              new AssignmentAuditService({
                port: createSupabaseAssignmentAuditDataPort(client),
              }),
            );

  const assignmentTargetVisibility: AssignmentTargetVisibilityPort | null =
    options?.assignmentTargetVisibility === false || options?.assignmentTargetVisibility === null
      ? null
      : typeof options?.assignmentTargetVisibility === "object"
        ? options.assignmentTargetVisibility
        : createSupabaseAssignmentTargetVisibilityPort(client);

  return {
    conversations: new ConversationService(conversationRepository, {
      prioritySlaHook: options?.prioritySlaHook ?? null,
      assignmentGovernance,
      linkedTicketAssignmentSync,
      assignmentAudit,
      assignmentTargetVisibility,
    }),
    participants: new ParticipantService(participantRepository, conversationRepository),
    messages: new MessageService(messageRepository, conversationRepository, participantRepository),
    state: new ConversationStateService(conversationRepository),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./services/conversation-service.js";
export * from "./services/conversation-state-service.js";
export * from "./services/conversation-visibility.js";
export * from "./services/assignment-visibility-compatibility.js";
export * from "./services/participant-service.js";
export * from "./state-machine/index.js";
export * from "./services/message-service.js";
export * from "./repositories/conversation-repository.js";
export * from "./repositories/participant-repository.js";
export * from "./repositories/message-repository.js";
export * from "./repositories/supabase-conversation-repository.js";
export * from "./repositories/supabase-participant-repository.js";
export * from "./repositories/supabase-message-repository.js";
export * from "./repositories/supabase-assignment-target-visibility-port.js";
export * from "./message-cache.js";
export * from "./display/parse-conversation-message-view.js";
