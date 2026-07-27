import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PlatformAIFeatureFlagRecord,
  PlatformAIModelRecord,
  PlatformAIProviderKeyRecord,
  PlatformAIProviderRecord,
  PlatformAIRuntimeConfig,
  PlatformAIUsageRecord,
  PlatformAIUseCase,
  RecordPlatformUsageInput,
  ServiceContext,
  UpsertPlatformModelInput,
  UpsertPlatformProviderKeyInput,
} from "./types.js";

function assertSuperAdmin(ctx: ServiceContext): void {
  if (!ctx.isSuperAdmin) {
    throw new Error("Platform AI administration requires super admin access.");
  }
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

export class PlatformAIProviderService {
  constructor(private readonly client: SupabaseClient) {}

  async listProviders(): Promise<PlatformAIProviderRecord[]> {
    const { data, error } = await this.client
      .from("platform_ai_providers")
      .select("*")
      .order("display_name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as PlatformAIProviderRecord[];
  }

  async listModels(providerId?: string): Promise<PlatformAIModelRecord[]> {
    let query = this.client.from("platform_ai_models").select("*").order("use_case", { ascending: true });
    if (providerId) query = query.eq("provider_id", providerId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PlatformAIModelRecord[];
  }

  async listProviderKeys(ctx: ServiceContext, providerId: string): Promise<PlatformAIProviderKeyRecord[]> {
    assertSuperAdmin(ctx);
    const { data, error } = await this.client
      .from("platform_ai_provider_keys")
      .select("id, provider_id, key_label, key_hint, is_active, rotated_at, created_at, updated_at")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as PlatformAIProviderKeyRecord[];
  }

  async upsertProviderKey(ctx: ServiceContext, input: UpsertPlatformProviderKeyInput): Promise<void> {
    assertSuperAdmin(ctx);
    const trimmed = input.apiKey.trim();
    if (!trimmed) throw new Error("API key is required.");

    const { data: encrypted, error: encryptError } = await this.client.rpc("platform_ai_encrypt_key", {
      p_plaintext: trimmed,
    });
    if (encryptError) throw encryptError;

    await this.client
      .from("platform_ai_provider_keys")
      .update({ is_active: false })
      .eq("provider_id", input.providerId)
      .eq("is_active", true);

    const { error } = await this.client.from("platform_ai_provider_keys").insert({
      provider_id: input.providerId,
      key_label: input.keyLabel ?? "primary",
      encrypted_key: encrypted,
      key_hint: trimmed.slice(-4),
      is_active: true,
      created_by: ctx.userId,
    });
    if (error) throw error;
  }

  async upsertDefaultModel(ctx: ServiceContext, input: UpsertPlatformModelInput): Promise<void> {
    assertSuperAdmin(ctx);
    if (input.isDefault !== false) {
      await this.client
        .from("platform_ai_models")
        .update({ is_default: false })
        .eq("provider_id", input.providerId)
        .eq("use_case", input.useCase);
    }

    const { error } = await this.client.from("platform_ai_models").upsert(
      {
        provider_id: input.providerId,
        use_case: input.useCase,
        model_name: input.modelName,
        is_default: input.isDefault ?? true,
        is_enabled: true,
      },
      { onConflict: "provider_id,use_case,model_name" },
    );
    if (error) throw error;
  }

  async listFeatureFlags(ctx: ServiceContext, companyId?: string): Promise<PlatformAIFeatureFlagRecord[]> {
    let query = this.client.from("platform_ai_feature_flags").select("*").order("company_id", { ascending: true });
    if (!ctx.isSuperAdmin && companyId) {
      query = query.eq("company_id", companyId);
    } else if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PlatformAIFeatureFlagRecord[];
  }

  async setFeatureFlag(
    ctx: ServiceContext,
    companyId: string,
    featureKey: PlatformAIFeatureFlagRecord["feature_key"],
    isEnabled: boolean,
  ): Promise<void> {
    assertSuperAdmin(ctx);
    const { error } = await this.client.from("platform_ai_feature_flags").upsert(
      {
        company_id: companyId,
        feature_key: featureKey,
        is_enabled: isEnabled,
        updated_by: ctx.userId,
      },
      { onConflict: "company_id,feature_key" },
    );
    if (error) throw error;
  }

  async listUsage(companyId?: string, limit = 100): Promise<PlatformAIUsageRecord[]> {
    let query = this.client
      .from("platform_ai_usage")
      .select("*")
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (companyId) query = query.eq("company_id", companyId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PlatformAIUsageRecord[];
  }

  async recordUsage(input: RecordPlatformUsageInput): Promise<void> {
    const inputTokens = input.inputTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    const { error } = await this.client.from("platform_ai_usage").insert({
      company_id: input.companyId,
      user_id: input.userId ?? null,
      provider_key: input.providerKey,
      model: input.model,
      use_case: input.useCase ?? "chat",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost_usd: input.estimatedCostUsd ?? null,
      latency_ms: input.latencyMs ?? null,
      status: input.status ?? "succeeded",
      error_code: input.errorCode ?? null,
      conversation_id: input.conversationId ?? null,
      execution_id: input.executionId ?? null,
    });
    if (error) throw error;
  }

  async isFeatureEnabled(companyId: string, featureKey: PlatformAIFeatureFlagRecord["feature_key"]): Promise<boolean> {
    const { data, error } = await this.client.rpc("platform_ai_feature_enabled", {
      p_company_id: companyId,
      p_feature_key: featureKey,
    });
    if (error) throw error;
    return Boolean(data);
  }

  async resolveRuntimeConfig(
    companyId: string,
    providerKey = "openai",
    useCase: PlatformAIUseCase = "chat",
  ): Promise<PlatformAIRuntimeConfig> {
    const { data, error } = await this.client.rpc("platform_resolve_ai_runtime_config", {
      p_company_id: companyId,
      p_provider_key: providerKey,
      p_use_case: useCase,
    });
    if (error) throw error;
    const payload = data as Record<string, unknown>;
    return {
      providerKey: String(payload.providerKey ?? providerKey),
      model: String(payload.model ?? "gpt-4o-mini"),
      apiKey: String(payload.apiKey ?? ""),
      baseUrl: String(payload.baseUrl ?? "https://api.openai.com/v1"),
      useCase: (payload.useCase as PlatformAIUseCase) ?? useCase,
      usesPlatformKey: Boolean(payload.usesPlatformKey ?? true),
    };
  }

  sanitizeTenantConnectionConfiguration(
    configuration: Record<string, unknown>,
    usesPlatformKey: boolean,
  ): Record<string, unknown> {
    return sanitizeConnectionConfiguration(configuration, usesPlatformKey);
  }
}

export function createPlatformAIProviderService(client: SupabaseClient): PlatformAIProviderService {
  return new PlatformAIProviderService(client);
}
