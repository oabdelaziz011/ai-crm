import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationState } from "@workspace/ai-conversation";
import type { IntentDefinitionRepository, IntentMatchRepository } from "./intent-repositories.js";
import type {
  ClassificationRules,
  CreateIntentMatchInput,
  IntentAlternative,
  IntentDefinitionRecord,
  IntentMatchRecord,
  ListIntentMatchesFilter,
  UpdateIntentDefinitionInput,
} from "../types.js";

const DEFINITIONS_TABLE = "intent_definitions";
const MATCHES_TABLE = "intent_matches";

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseSupportedStates(value: unknown): ConversationState[] {
  return parseStringArray(value) as ConversationState[];
}

function mapDefinition(row: Record<string, unknown>): IntentDefinitionRecord {
  return {
    id: row.id as string,
    key: row.key as string,
    display_name: row.display_name as string,
    description: row.description as string,
    category: row.category as string,
    priority: Number(row.priority ?? 100),
    confidence_threshold: Number(row.confidence_threshold ?? 0.6),
    required_states: parseSupportedStates(row.required_states),
    required_permissions: parseStringArray(row.required_permissions),
    matched_tool_key: (row.matched_tool_key as string | null) ?? null,
    classification_rules: (row.classification_rules as ClassificationRules) ?? {},
    requires_human: Boolean(row.requires_human),
    requires_llm: Boolean(row.requires_llm),
    is_enabled: Boolean(row.is_enabled),
    version: row.version as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapMatch(row: Record<string, unknown>): IntentMatchRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    conversation_id: row.conversation_id as string,
    intent_definition_id: (row.intent_definition_id as string | null) ?? null,
    intent_key: row.intent_key as string,
    classifier_key: row.classifier_key as IntentMatchRecord["classifier_key"],
    message_preview: row.message_preview as string,
    confidence: Number(row.confidence ?? 0),
    matched_tool_key: (row.matched_tool_key as string | null) ?? null,
    reason: row.reason as string,
    alternatives: (row.alternatives as IntentAlternative[]) ?? [],
    requires_human: Boolean(row.requires_human),
    requires_llm: Boolean(row.requires_llm),
    status: row.status as IntentMatchRecord["status"],
    created_at: row.created_at as string,
    created_by: (row.created_by as string | null) ?? null,
  };
}

export function createSupabaseIntentDefinitionRepository(
  client: SupabaseClient,
): IntentDefinitionRepository {
  return {
    async listEnabled(): Promise<IntentDefinitionRecord[]> {
      const { data, error } = await client
        .from(DEFINITIONS_TABLE)
        .select("*")
        .eq("is_enabled", true)
        .order("priority", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row) => mapDefinition(row as Record<string, unknown>));
    },

    async listAll(): Promise<IntentDefinitionRecord[]> {
      const { data, error } = await client
        .from(DEFINITIONS_TABLE)
        .select("*")
        .order("priority", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row) => mapDefinition(row as Record<string, unknown>));
    },

    async findById(id: string): Promise<IntentDefinitionRecord | null> {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapDefinition(data as Record<string, unknown>);
    },

    async findByKey(key: string): Promise<IntentDefinitionRecord | null> {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").eq("key", key).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapDefinition(data as Record<string, unknown>);
    },

    async updateEnabled(input: UpdateIntentDefinitionInput): Promise<IntentDefinitionRecord> {
      const { data, error } = await client
        .from(DEFINITIONS_TABLE)
        .update({ is_enabled: input.isEnabled })
        .eq("id", input.intentId)
        .select("*")
        .single();

      if (error) throw error;
      return mapDefinition(data as Record<string, unknown>);
    },
  };
}

export function createSupabaseIntentMatchRepository(client: SupabaseClient): IntentMatchRepository {
  return {
    async create(input: CreateIntentMatchInput): Promise<IntentMatchRecord> {
      const { data, error } = await client
        .from(MATCHES_TABLE)
        .insert({
          company_id: input.companyId,
          conversation_id: input.conversationId,
          intent_definition_id: input.intentDefinitionId,
          intent_key: input.intentKey,
          classifier_key: input.classifierKey,
          message_preview: input.messagePreview,
          confidence: input.confidence,
          matched_tool_key: input.matchedToolKey,
          reason: input.reason,
          alternatives: input.alternatives,
          requires_human: input.requiresHuman,
          requires_llm: input.requiresLlm,
          status: input.status,
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapMatch(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<IntentMatchRecord | null> {
      const { data, error } = await client.from(MATCHES_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapMatch(data as Record<string, unknown>);
    },

    async list(filter: ListIntentMatchesFilter): Promise<IntentMatchRecord[]> {
      let query = client
        .from(MATCHES_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("created_at", { ascending: false });

      if (filter.conversationId) query = query.eq("conversation_id", filter.conversationId);
      if (filter.intentKey) query = query.eq("intent_key", filter.intentKey);
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.limit) query = query.limit(filter.limit);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapMatch(row as Record<string, unknown>));
    },
  };
}
