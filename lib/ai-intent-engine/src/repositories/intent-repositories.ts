import type { ConversationState } from "@workspace/ai-conversation";
import type {
  CreateIntentMatchInput,
  IntentDefinitionRecord,
  IntentMatchRecord,
  ListIntentMatchesFilter,
  UpdateIntentDefinitionInput,
} from "../types.js";

export interface IntentDefinitionRepository {
  listEnabled(): Promise<IntentDefinitionRecord[]>;
  listAll(): Promise<IntentDefinitionRecord[]>;
  findById(id: string): Promise<IntentDefinitionRecord | null>;
  findByKey(key: string): Promise<IntentDefinitionRecord | null>;
  updateEnabled(input: UpdateIntentDefinitionInput): Promise<IntentDefinitionRecord>;
}

export interface IntentMatchRepository {
  create(input: CreateIntentMatchInput): Promise<IntentMatchRecord>;
  findById(id: string): Promise<IntentMatchRecord | null>;
  list(filter: ListIntentMatchesFilter): Promise<IntentMatchRecord[]>;
}

export function supportsConversationState(
  requiredStates: ConversationState[],
  state: ConversationState,
): boolean {
  if (requiredStates.length === 0) return true;
  return requiredStates.includes(state);
}

export function findMissingPermission(
  ctx: { isSuperAdmin: boolean; hasPermission: (code: string) => boolean },
  permissions: string[],
): string | null {
  if (ctx.isSuperAdmin) return null;
  for (const permission of permissions) {
    if (!ctx.hasPermission(permission)) {
      return permission;
    }
  }
  return null;
}

export function truncateMessagePreview(messageText: string, maxLength = 240): string {
  const trimmed = messageText.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}
