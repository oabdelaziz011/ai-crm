import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AIProviderFactory,
  AIProviderRegistryService,
  createAIProviderAdapterRegistry,
  createSupabaseAIProviderConnectionRepository,
  createSupabaseAIProviderDefinitionRepository,
  createStubAdapters,
} from "@workspace/ai-provider-layer";
import {
  createEmbeddingProviderAdapterRegistry,
  createOpenAIEmbeddingAdapter,
  createSupabaseEmbeddingProviderConnectionRepository,
  createSupabaseEmbeddingProviderDefinitionRepository,
  EmbeddingProviderFactory,
  EmbeddingProviderRegistryService,
} from "@workspace/embedding-platform";
import { createVectorStoreServices } from "@workspace/vector-store";
import {
  DEFAULT_ASSISTANT_SETTINGS,
  DEFAULT_COLLECTION_DIMENSIONS,
  DEFAULT_COLLECTION_NAME,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_VERSION,
  DEFAULT_EXECUTION_POLICY_NAME,
  DEFAULT_RETRIEVAL_POLICY_NAME,
  DEFAULT_VECTOR_SEARCH_POLICY_NAME,
  TENANT_AI_BOOTSTRAP_RPC,
  TENANT_AI_REPAIR_RPC,
  TENANT_PROMPT_SECTIONS,
  TENANT_PROMPT_TEMPLATE_KEYS,
} from "../constants.js";
import { parseTenantAiBootstrapResult } from "../parse-tenant-ai-bootstrap-result.js";
import type {
  ServiceContext,
  TenantAiBootstrapOptions,
  TenantAiBootstrapResult,
  TenantAiBootstrapStepResult,
  TenantAiBootstrapVerification,
} from "../types.js";

function createBootstrapContext(companyId: string, userId: string | null): ServiceContext {
  return {
    userId,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

function step(
  stepName: TenantAiBootstrapStepResult["step"],
  created: boolean,
  skipped: boolean,
  resourceId?: string,
  detail?: string,
): TenantAiBootstrapStepResult {
  return { step: stepName, created, skipped, resourceId, detail };
}

export { parseTenantAiBootstrapResult } from "../parse-tenant-ai-bootstrap-result.js";

export class TenantAiBootstrapService {
  constructor(private readonly client: SupabaseClient) {}

  async provisionViaRpc(companyId: string): Promise<TenantAiBootstrapResult> {
    const { data, error } = await this.client.rpc(TENANT_AI_BOOTSTRAP_RPC, {
      p_company_id: companyId,
    });
    if (error) throw error;
    return parseTenantAiBootstrapResult(data, companyId);
  }

  async repairViaRpc(): Promise<Record<string, unknown>> {
    const { data, error } = await this.client.rpc(TENANT_AI_REPAIR_RPC);
    if (error) throw error;
    return (data ?? {}) as Record<string, unknown>;
  }

  async provisionWithServices(
    companyId: string,
    options: TenantAiBootstrapOptions = {},
  ): Promise<TenantAiBootstrapResult> {
    const { data: company, error: companyError } = await this.client
      .from("companies")
      .select("id, company_type")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return {
        companyId,
        skipped: true,
        reason: "company_not_found",
        steps: [],
      };
    }

    if (company.company_type === "demo") {
      return {
        companyId,
        skipped: true,
        reason: "non_tenant_company",
        steps: [],
      };
    }

    if (company.company_type === "platform" && !options.includePlatformCompanies) {
      return {
        companyId,
        skipped: true,
        reason: "non_tenant_company",
        steps: [],
      };
    }

    const ctx = createBootstrapContext(companyId, options.userId ?? null);
    const openAiApiKey = options.openAiApiKey ?? process.env.OPENAI_API_KEY ?? null;
    const providerEnabled = Boolean(openAiApiKey?.trim());
    const steps: TenantAiBootstrapStepResult[] = [];

    steps.push(await this.ensureAssistantSettings(companyId));
    steps.push(await this.ensureAiProviderConnection(ctx, companyId, openAiApiKey, providerEnabled));
    steps.push(await this.ensureEmbeddingConnection(ctx, companyId, openAiApiKey, providerEnabled));
    steps.push(await this.ensureVectorStoreConnection(ctx, companyId));
    steps.push(await this.ensureKnowledgeCollection(ctx, companyId));
    steps.push(await this.ensureRetrievalPolicy(companyId));
    steps.push(await this.ensureExecutionPolicy(companyId));
    steps.push(await this.ensureVectorSearchPolicy(companyId));
    steps.push(...(await this.ensurePromptTemplates(companyId)));

    return { companyId, skipped: false, steps };
  }

  async verify(companyId: string): Promise<TenantAiBootstrapVerification> {
    const [
      settings,
      aiConnections,
      embeddingConnections,
      vectorConnections,
      collections,
      retrievalPolicies,
      executionPolicies,
      searchPolicies,
      promptTemplates,
    ] = await Promise.all([
      this.client.from("ai_assistant_settings").select("id").eq("company_id", companyId).maybeSingle(),
      this.client
        .from("ai_provider_connections")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null),
      this.client
        .from("embedding_provider_connections")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null),
      this.client
        .from("vector_store_connections")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null),
      this.client
        .from("vector_collections")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("name", DEFAULT_COLLECTION_NAME)
        .is("deleted_at", null),
      this.client
        .from("retrieval_policies")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_default", true),
      this.client
        .from("execution_policies")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_default", true),
      this.client
        .from("vector_search_policies")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_default", true),
      this.client
        .from("prompt_templates")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("key", [TENANT_PROMPT_TEMPLATE_KEYS.conversationEn, TENANT_PROMPT_TEMPLATE_KEYS.conversationAr]),
    ]);

    return {
      hasAssistantSettings: Boolean(settings.data?.id),
      aiProviderConnectionCount: aiConnections.count ?? 0,
      embeddingConnectionCount: embeddingConnections.count ?? 0,
      vectorStoreConnectionCount: vectorConnections.count ?? 0,
      defaultCollectionCount: collections.count ?? 0,
      retrievalPolicyCount: retrievalPolicies.count ?? 0,
      executionPolicyCount: (executionPolicies.count ?? 0) > 0,
      vectorSearchPolicyCount: (searchPolicies.count ?? 0) > 0,
      promptTemplateCount: promptTemplates.count ?? 0,
    };
  }

  private async ensureAssistantSettings(companyId: string): Promise<TenantAiBootstrapStepResult> {
    const { data: existing } = await this.client
      .from("ai_assistant_settings")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();

    if (existing?.id) {
      return step("assistant_settings", false, true, existing.id, "existing settings preserved");
    }

    const { data, error } = await this.client
      .from("ai_assistant_settings")
      .insert({
        company_id: companyId,
        is_enabled: true,
        provider: "openai",
        model: DEFAULT_ASSISTANT_SETTINGS.model,
        temperature: DEFAULT_ASSISTANT_SETTINGS.temperature,
        max_tokens: DEFAULT_ASSISTANT_SETTINGS.maxTokens,
        response_language: "system",
        assistant_name: DEFAULT_ASSISTANT_SETTINGS.assistantNameEn,
        language: "en",
        personality: "helpful",
        tone: "professional",
        welcome_message: DEFAULT_ASSISTANT_SETTINGS.welcomeMessageEn,
        fallback_message: DEFAULT_ASSISTANT_SETTINGS.fallbackMessageEn,
        knowledge_enabled: true,
      })
      .select("id")
      .single();

    if (error) throw error;
    return step("assistant_settings", true, false, data.id as string);
  }

  private async ensureAiProviderConnection(
    ctx: ServiceContext,
    companyId: string,
    openAiApiKey: string | null,
    providerEnabled: boolean,
  ): Promise<TenantAiBootstrapStepResult> {
    const definitionRepo = createSupabaseAIProviderDefinitionRepository(this.client);
    const connectionRepo = createSupabaseAIProviderConnectionRepository(this.client);
    const factory = new AIProviderFactory(definitionRepo, createAIProviderAdapterRegistry(createStubAdapters()));
    const registry = new AIProviderRegistryService(definitionRepo, connectionRepo, factory);

    const connections = await registry.listConnections(ctx, { companyId });
    const existing = connections.find((item) => item.ai_provider_definition?.key === "openai");
    if (existing) {
      return step("ai_provider_connection", false, true, existing.id, "existing OpenAI connection preserved");
    }

    const provider = await definitionRepo.findByKey("openai");
    if (!provider) throw new Error("OpenAI provider definition not found.");

    const configuration: Record<string, unknown> = {
      model: DEFAULT_ASSISTANT_SETTINGS.model,
      execution_policy: { streaming: true, response_format: "text" },
    };
    if (openAiApiKey?.trim()) {
      configuration.apiKey = openAiApiKey.trim();
    }

    const created = await registry.createConnection(ctx, {
      companyId,
      providerId: provider.id,
      displayName: "Default OpenAI Connection",
      configuration,
      isEnabled: providerEnabled,
      isDefault: true,
    });

    return step(
      "ai_provider_connection",
      true,
      false,
      created.id,
      providerEnabled ? "enabled with configured API key" : "created disabled pending API key",
    );
  }

  private async ensureEmbeddingConnection(
    ctx: ServiceContext,
    companyId: string,
    openAiApiKey: string | null,
    providerEnabled: boolean,
  ): Promise<TenantAiBootstrapStepResult> {
    const definitionRepo = createSupabaseEmbeddingProviderDefinitionRepository(this.client);
    const connectionRepo = createSupabaseEmbeddingProviderConnectionRepository(this.client);
    const factory = new EmbeddingProviderFactory(
      definitionRepo,
      createEmbeddingProviderAdapterRegistry({
        openai: (configuration) =>
          createOpenAIEmbeddingAdapter({
            apiKey: typeof configuration.apiKey === "string" ? configuration.apiKey : "bootstrap-placeholder",
            model: DEFAULT_EMBEDDING_MODEL,
            dimensions: DEFAULT_COLLECTION_DIMENSIONS,
            ...configuration,
          }),
      }),
    );
    const registry = new EmbeddingProviderRegistryService(definitionRepo, connectionRepo, factory);

    const connections = await registry.listConnections(ctx, { companyId });
    const existing = connections.find((item) => item.embedding_provider_definition?.key === "openai");
    if (existing) {
      return step("embedding_connection", false, true, existing.id, "existing embedding connection preserved");
    }

    const provider = await definitionRepo.findByKey("openai");
    if (!provider) throw new Error("OpenAI embedding provider definition not found.");

    const configuration: Record<string, unknown> = {
      model: DEFAULT_EMBEDDING_MODEL,
      dimensions: DEFAULT_COLLECTION_DIMENSIONS,
    };
    if (openAiApiKey?.trim()) {
      configuration.apiKey = openAiApiKey.trim();
    }

    const created = await registry.createConnection(ctx, {
      companyId,
      providerId: provider.id,
      displayName: "Default OpenAI Embeddings",
      configuration,
      isEnabled: providerEnabled,
      isDefault: true,
    });

    return step(
      "embedding_connection",
      true,
      false,
      created.id,
      providerEnabled ? "enabled with configured API key" : "created disabled pending API key",
    );
  }

  private async ensureVectorStoreConnection(
    ctx: ServiceContext,
    companyId: string,
  ): Promise<TenantAiBootstrapStepResult> {
    const vectorStore = createVectorStoreServices(this.client);
    const connections = await vectorStore.registry.listConnections(ctx, { companyId });
    const existing = connections.find((item) => item.vector_store_definition?.key === "pgvector");
    if (existing) {
      return step("vector_store_connection", false, true, existing.id, "existing pgvector connection preserved");
    }

    const { data: provider } = await this.client
      .from("vector_store_definitions")
      .select("id")
      .eq("key", "pgvector")
      .maybeSingle();
    if (!provider?.id) throw new Error("pgvector provider definition not found.");

    const created = await vectorStore.registry.createConnection(ctx, {
      companyId,
      providerId: provider.id,
      displayName: "Default PGVector Store",
      configuration: { schema: "public", tablePrefix: "vs_", companyId },
      isEnabled: true,
      isDefault: true,
    });
    const activated = await vectorStore.registry.activateConnection(ctx, created.id);

    return step("vector_store_connection", true, false, activated.id);
  }

  private async ensureKnowledgeCollection(
    ctx: ServiceContext,
    companyId: string,
  ): Promise<TenantAiBootstrapStepResult> {
    const vectorStore = createVectorStoreServices(this.client);
    const collections = await vectorStore.collections.listCollections(ctx, { companyId });
    const existing = collections.find((item) => item.name === DEFAULT_COLLECTION_NAME);
    if (existing) {
      return step("knowledge_collection", false, true, existing.id, "existing default collection preserved");
    }

    const connections = await vectorStore.registry.listConnections(ctx, { companyId });
    const connection =
      connections.find((item) => item.vector_store_definition?.key === "pgvector" && item.is_enabled) ??
      connections.find((item) => item.vector_store_definition?.key === "pgvector");
    if (!connection) {
      throw new Error("pgvector connection is required before provisioning the default collection.");
    }

    const collection = await vectorStore.management.provisionCollection(ctx, {
      companyId,
      connectionId: connection.id,
      name: DEFAULT_COLLECTION_NAME,
      embeddingVersion: DEFAULT_EMBEDDING_VERSION,
      dimensions: DEFAULT_COLLECTION_DIMENSIONS,
      metadata: { bootstrap: true, purpose: "knowledge_default" },
    });

    return step("knowledge_collection", true, false, collection.id);
  }

  private async ensureRetrievalPolicy(companyId: string): Promise<TenantAiBootstrapStepResult> {
    const { data: existing } = await this.client
      .from("retrieval_policies")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();

    if (existing?.id) {
      return step("retrieval_policy", false, true, existing.id, "existing default retrieval policy preserved");
    }

    const { data, error } = await this.client
      .from("retrieval_policies")
      .insert({
        company_id: companyId,
        policy_name: DEFAULT_RETRIEVAL_POLICY_NAME,
        max_context_tokens: 4096,
        max_chunks: 20,
        window_expansion: 1,
        min_source_diversity: 1,
        overlap_removal_threshold: 0.85,
        default_language: "en",
        chunk_selection_strategy: "score_first",
        is_default: true,
        metadata: { bootstrap: true },
      })
      .select("id")
      .single();

    if (error) throw error;
    return step("retrieval_policy", true, false, data.id as string);
  }

  private async ensureExecutionPolicy(companyId: string): Promise<TenantAiBootstrapStepResult> {
    const { data: existing } = await this.client
      .from("execution_policies")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();

    if (existing?.id) {
      return step("execution_policy", false, true, existing.id, "existing default execution policy preserved");
    }

    const { data, error } = await this.client
      .from("execution_policies")
      .insert({
        company_id: companyId,
        policy_name: DEFAULT_EXECUTION_POLICY_NAME,
        knowledge_retrieval_enabled: true,
        max_pipeline_duration_ms: 120000,
        is_default: true,
        metadata: { bootstrap: true },
      })
      .select("id")
      .single();

    if (error) throw error;
    return step("execution_policy", true, false, data.id as string);
  }

  private async ensureVectorSearchPolicy(companyId: string): Promise<TenantAiBootstrapStepResult> {
    const { data: existing } = await this.client
      .from("vector_search_policies")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .maybeSingle();

    if (existing?.id) {
      return step("vector_search_policy", false, true, existing.id, "existing default search policy preserved");
    }

    const { data, error } = await this.client
      .from("vector_search_policies")
      .insert({
        company_id: companyId,
        policy_name: DEFAULT_VECTOR_SEARCH_POLICY_NAME,
        default_top_k: 10,
        minimum_similarity_score: 0,
        maximum_results: 50,
        is_default: true,
        metadata: { bootstrap: true },
      })
      .select("id")
      .single();

    if (error) throw error;
    return step("vector_search_policy", true, false, data.id as string);
  }

  private async ensurePromptTemplates(companyId: string): Promise<TenantAiBootstrapStepResult[]> {
    const templates = [
      {
        key: TENANT_PROMPT_TEMPLATE_KEYS.conversationEn,
        displayName: "Tenant Conversation (English)",
        sections: TENANT_PROMPT_SECTIONS.en,
      },
      {
        key: TENANT_PROMPT_TEMPLATE_KEYS.conversationAr,
        displayName: "Tenant Conversation (Arabic)",
        sections: TENANT_PROMPT_SECTIONS.ar,
      },
    ] as const;

    const results: TenantAiBootstrapStepResult[] = [];

    for (const template of templates) {
      const { data: existing } = await this.client
        .from("prompt_templates")
        .select("id")
        .eq("company_id", companyId)
        .eq("key", template.key)
        .maybeSingle();

      if (existing?.id) {
        results.push(
          step("prompt_templates", false, true, existing.id, `${template.key} preserved`),
        );
        continue;
      }

      const { data: createdTemplate, error: templateError } = await this.client
        .from("prompt_templates")
        .insert({
          company_id: companyId,
          key: template.key,
          display_name: template.displayName,
          description: "Tenant bootstrap conversation prompt template.",
          template_type: "conversation",
          section_order: ["system_instructions", "language"],
          is_enabled: true,
        })
        .select("id")
        .single();

      if (templateError) throw templateError;

      const { data: version, error: versionError } = await this.client
        .from("prompt_template_versions")
        .insert({
          template_id: createdTemplate.id,
          version_number: 1,
          version_label: "1.0.0",
          sections: template.sections,
          is_active: true,
        })
        .select("id")
        .single();

      if (versionError) throw versionError;

      await this.client
        .from("prompt_templates")
        .update({ active_version_id: version.id })
        .eq("id", createdTemplate.id);

      results.push(step("prompt_templates", true, false, createdTemplate.id as string, template.key));
    }

    return results;
  }
}

export function createTenantAiBootstrapService(client: SupabaseClient): TenantAiBootstrapService {
  return new TenantAiBootstrapService(client);
}
