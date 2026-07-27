import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AIProviderConnectionRepository,
  AIProviderDefinitionRepository,
} from "./provider-repositories.js";
import type {
  AIProviderConnectionRecord,
  AIProviderDefinitionRecord,
  CreateAIProviderConnectionInput,
  ListAIProviderConnectionsFilter,
  UpdateAIProviderConnectionHealthInput,
  UpdateAIProviderConnectionInput,
} from "../types.js";
import { AIProviderConnectionNotFoundError } from "../errors.js";

const DEFINITIONS_TABLE = "ai_provider_definitions";
const CONNECTIONS_TABLE = "ai_provider_connections";
const SELECT_WITH_PROVIDER =
  "*, ai_provider_definition:ai_provider_definitions(id, key, display_name, description, icon, supports_generate, supports_classify, supports_embed, supports_streaming, configuration_schema, default_configuration, is_active, version, created_at, updated_at)";

function mapDefinition(row: Record<string, unknown>): AIProviderDefinitionRecord {
  return {
    id: row.id as string,
    key: row.key as string,
    display_name: row.display_name as string,
    description: row.description as string,
    icon: (row.icon as string | null) ?? null,
    supports_generate: Boolean(row.supports_generate),
    supports_classify: Boolean(row.supports_classify),
    supports_embed: Boolean(row.supports_embed),
    supports_streaming: Boolean(row.supports_streaming),
    configuration_schema: (row.configuration_schema as Record<string, unknown>) ?? {},
    default_configuration: (row.default_configuration as Record<string, unknown>) ?? {},
    is_active: Boolean(row.is_active),
    version: row.version as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function sanitizeConnectionConfiguration(
  configuration: Record<string, unknown>,
  usesPlatformKey: boolean,
): Record<string, unknown> {
  if (!usesPlatformKey) return { ...configuration };
  const next = { ...configuration };
  delete next.apiKey;
  delete next.api_key;
  delete next.secret;
  delete next.token;
  return next;
}

function mapConnection(row: Record<string, unknown>): AIProviderConnectionRecord {
  const embedded = row.ai_provider_definition ?? row.ai_provider_definitions;
  const providerRow = Array.isArray(embedded) ? embedded[0] : embedded;
  const usesPlatformKey = row.uses_platform_key !== false;

  return {
    id: row.id as string,
    company_id: row.company_id as string,
    provider_id: row.provider_id as string,
    display_name: row.display_name as string,
    status: row.status as AIProviderConnectionRecord["status"],
    configuration: sanitizeConnectionConfiguration(
      (row.configuration as Record<string, unknown>) ?? {},
      usesPlatformKey,
    ),
    is_default: Boolean(row.is_default),
    is_enabled: Boolean(row.is_enabled),
    health_status: row.health_status as AIProviderConnectionRecord["health_status"],
    last_health_check: (row.last_health_check as string | null) ?? null,
    uses_platform_key: usesPlatformKey,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
    ai_provider_definition: providerRow ? mapDefinition(providerRow as Record<string, unknown>) : null,
  };
}

export function createSupabaseAIProviderDefinitionRepository(
  client: SupabaseClient,
): AIProviderDefinitionRepository {
  return {
    async listActive(): Promise<AIProviderDefinitionRecord[]> {
      const { data, error } = await client
        .from(DEFINITIONS_TABLE)
        .select("*")
        .eq("is_active", true)
        .order("display_name", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => mapDefinition(row as Record<string, unknown>));
    },

    async listAll(): Promise<AIProviderDefinitionRecord[]> {
      const { data, error } = await client
        .from(DEFINITIONS_TABLE)
        .select("*")
        .order("display_name", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => mapDefinition(row as Record<string, unknown>));
    },

    async findById(id: string): Promise<AIProviderDefinitionRecord | null> {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapDefinition(data as Record<string, unknown>);
    },

    async findByKey(key: string): Promise<AIProviderDefinitionRecord | null> {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").eq("key", key).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapDefinition(data as Record<string, unknown>);
    },
  };
}

export function createSupabaseAIProviderConnectionRepository(
  client: SupabaseClient,
): AIProviderConnectionRepository {
  return {
    async create(input: CreateAIProviderConnectionInput): Promise<AIProviderConnectionRecord> {
      if (input.isDefault) {
        const { error: clearDefaultError } = await client
          .from(CONNECTIONS_TABLE)
          .update({ is_default: false })
          .eq("company_id", input.companyId)
          .is("deleted_at", null);

        if (clearDefaultError) throw clearDefaultError;
      }

      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .insert({
          company_id: input.companyId,
          provider_id: input.providerId,
          display_name: input.displayName,
          configuration: input.configuration ?? {},
          is_default: input.isDefault ?? false,
          is_enabled: input.isEnabled ?? false,
          uses_platform_key: true,
          status: input.status ?? "pending",
          health_status: input.healthStatus ?? "unknown",
        })
        .select(SELECT_WITH_PROVIDER)
        .single();

      if (error) throw error;
      return mapConnection(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<AIProviderConnectionRecord | null> {
      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .select(SELECT_WITH_PROVIDER)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapConnection(data as Record<string, unknown>);
    },

    async list(filter: ListAIProviderConnectionsFilter): Promise<AIProviderConnectionRecord[]> {
      let query = client
        .from(CONNECTIONS_TABLE)
        .select(SELECT_WITH_PROVIDER)
        .eq("company_id", filter.companyId)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });

      if (filter.isEnabled !== undefined) query = query.eq("is_enabled", filter.isEnabled);
      if (filter.healthStatus) query = query.eq("health_status", filter.healthStatus);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []).map((row) => mapConnection(row as Record<string, unknown>));
      if (filter.providerKey) {
        rows = rows.filter((row) => row.ai_provider_definition?.key === filter.providerKey);
      }
      return rows;
    },

    async update(input: UpdateAIProviderConnectionInput): Promise<AIProviderConnectionRecord> {
      const existing = await this.findById(input.connectionId);
      if (!existing) throw new AIProviderConnectionNotFoundError(input.connectionId);

      if (input.isDefault) {
        await client
          .from(CONNECTIONS_TABLE)
          .update({ is_default: false })
          .eq("company_id", existing.company_id)
          .is("deleted_at", null);
      }

      const patch: Record<string, unknown> = {};
      if (input.configuration !== undefined) patch.configuration = input.configuration;
      if (input.displayName !== undefined) patch.display_name = input.displayName;
      if (input.status !== undefined) patch.status = input.status;
      if (input.isEnabled !== undefined) patch.is_enabled = input.isEnabled;
      if (input.isDefault !== undefined) patch.is_default = input.isDefault;

      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .update(patch)
        .eq("id", input.connectionId)
        .select(SELECT_WITH_PROVIDER)
        .single();

      if (error) throw error;
      return mapConnection(data as Record<string, unknown>);
    },

    async updateHealth(input: UpdateAIProviderConnectionHealthInput): Promise<AIProviderConnectionRecord> {
      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .update({
          health_status: input.healthStatus,
          last_health_check: input.lastHealthCheck ?? new Date().toISOString(),
        })
        .eq("id", input.connectionId)
        .is("deleted_at", null)
        .select(SELECT_WITH_PROVIDER)
        .single();

      if (error) throw error;
      return mapConnection(data as Record<string, unknown>);
    },

    async softDelete(connectionId: string, deletedBy?: string | null): Promise<AIProviderConnectionRecord> {
      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: deletedBy ?? null,
          is_enabled: false,
          is_default: false,
          status: "disabled",
        })
        .eq("id", connectionId)
        .select(SELECT_WITH_PROVIDER)
        .single();

      if (error) throw error;
      return mapConnection(data as Record<string, unknown>);
    },
  };
}
