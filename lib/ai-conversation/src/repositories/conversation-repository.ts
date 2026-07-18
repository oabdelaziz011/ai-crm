import type {
  ApplyMessageCacheInput,
  AssignConversationInput,
  CloseConversationInput,
  ConversationRecord,
  CreateConversationInput,
  ListConversationsFilter,
  ReleaseConversationInput,
  UpdateConversationMetadataInput,
  UpdateConversationPriorityInput,
  UpdateConversationStateInput,
  ApplyStateTransitionInput,
} from "../types.js";
import type { ConversationChannelType } from "../constants.js";

export interface ConversationRepository {
  create(input: CreateConversationInput): Promise<ConversationRecord>;
  findById(id: string): Promise<ConversationRecord | null>;
  findByNumber(companyId: string, conversationNumber: string): Promise<ConversationRecord | null>;
  list(filter: ListConversationsFilter): Promise<ConversationRecord[]>;
  close(input: CloseConversationInput): Promise<ConversationRecord>;
  assign(input: AssignConversationInput): Promise<ConversationRecord>;
  release(input: ReleaseConversationInput): Promise<ConversationRecord>;
  updateState(input: UpdateConversationStateInput): Promise<ConversationRecord>;
  updatePriority(input: UpdateConversationPriorityInput): Promise<ConversationRecord>;
  updateMetadata(input: UpdateConversationMetadataInput): Promise<ConversationRecord>;
  applyMessageCache(input: ApplyMessageCacheInput): Promise<void>;
  resetEmployeeUnread(conversationId: string, updatedBy?: string | null): Promise<ConversationRecord>;
  resetCustomerUnread(conversationId: string, updatedBy?: string | null): Promise<ConversationRecord>;
  applyStateTransition(input: ApplyStateTransitionInput): Promise<ConversationRecord>;
  /** @deprecated Use applyMessageCache instead. Preserved for backward compatibility. */
  touchLastMessageAt(conversationId: string, at?: string): Promise<void>;
  resolveCompanyChannel(
    companyChannelId: string,
  ): Promise<{ companyId: string; channelKey: ConversationChannelType; isEnabled: boolean } | null>;
}
