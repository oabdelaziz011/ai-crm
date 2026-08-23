import type { AiEmployeeRepository } from "@/lib/ai-employees/repositories";
import type { AiEmployeeLifecycleRepository } from "@/lib/ai-employees/repositories/ai-employee-lifecycle-repository";
import { buildAgentRuntimeConfiguration } from "@/lib/ai-employees/adapters/ai-employee-runtime-adapter";
import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import type { AiEmployeeRuntimeAdapterInput } from "@/lib/ai-employees/adapters/ai-employee-runtime-types";
import { buildToolMetadataCatalog } from "@/lib/ai-employees/adapters/tool-metadata-adapter";
import type { AiEmployeeConfigurationUpdate, AiEmployeeRecord } from "@/lib/ai-employees/types";
import type { RuntimeChatExecutionConfig } from "@/lib/runtime-integration/chat-config";
import { summarizeKnowledge, summarizeSkills, summarizeSystemPrompt, summarizeTools } from "@/lib/ai-employees/selectors";
import { AiEmployeeRegistryError } from "./ai-employee-errors";
import type { AiEmployeeRegistryService } from "./ai-employee-registry-service";
import type { AiEmployeeSkillService } from "./ai-employee-skill-service";

export type TenantRuntimeContext = {
  companyId: string;
  config: RuntimeChatExecutionConfig;
  providerConnectionName: string | null;
  providerRegistryKey: string | null;
  collectionName: string | null;
  availableModels: string[];
};

function mapTenantKnowledgeRetrieval(
  config: RuntimeChatExecutionConfig,
  collectionName: string | null,
): AiEmployeeRuntimeAdapterInput["tenantRuntime"]["knowledgeRetrieval"] {
  const retrieval = config.knowledgeRetrieval;
  if (!retrieval?.collectionId) return null;

  const embeddingConnectionId = retrieval.embeddingConnectionId;
  const vectorStoreConnectionId = retrieval.vectorStoreConnectionId ?? retrieval.connectionId;
  if (!embeddingConnectionId || !vectorStoreConnectionId) return null;

  return {
    embeddingConnectionId,
    vectorStoreConnectionId,
    collectionId: retrieval.collectionId,
    collectionName,
  };
}

export class AiEmployeeConfigurationService {
  constructor(
    private readonly registry: AiEmployeeRegistryService,
    private readonly repository: AiEmployeeRepository,
    private readonly lifecycle?: AiEmployeeLifecycleRepository,
    private readonly skills?: AiEmployeeSkillService,
  ) {}

  async buildRuntimePreview(
    employee: AiEmployeeRecord,
    tenantRuntime: TenantRuntimeContext,
  ): Promise<AgentRuntimeConfiguration> {
    const [knowledgeSources, dbTools] = await Promise.all([
      this.repository.listKnowledgeSourceDetails(
        tenantRuntime.companyId,
        employee.knowledgeSourceIds.length > 0 ? employee.knowledgeSourceIds : undefined,
      ),
      this.repository.listEnabledTools(),
    ]);

    const toolCatalog = buildToolMetadataCatalog(dbTools);
    const allowedToolKeys =
      this.skills != null
        ? await this.skills.resolveToolKeysForEmployee(tenantRuntime.companyId, employee)
        : employee.allowedToolKeys;

    return buildAgentRuntimeConfiguration({
      employee: {
        id: employee.id,
        name: employee.name,
        displayName: employee.displayName,
        status: employee.status,
        provider: employee.provider,
        model: employee.model,
        temperature: employee.temperature,
        maxTokens: employee.maxTokens,
        systemPrompt: employee.systemPrompt,
        systemPromptSummary: employee.systemPromptSummary,
        welcomeMessage: employee.welcomeMessage,
        knowledgeSourceIds: employee.knowledgeSourceIds,
        allowedToolKeys,
        promptVersionLabel: employee.promptVersionLabel,
        runtimeConfiguration: employee.runtimeConfiguration,
      },
      tenantRuntime: {
        providerConnectionId: tenantRuntime.config.providerConnectionId,
        providerConnectionName: tenantRuntime.providerConnectionName,
        providerRegistryKey: tenantRuntime.providerRegistryKey,
        knowledgeRetrieval: mapTenantKnowledgeRetrieval(tenantRuntime.config, tenantRuntime.collectionName),
        missing: tenantRuntime.config.missing,
      },
      knowledgeSources,
      toolCatalog,
      availableModels: tenantRuntime.availableModels,
    });
  }

  async updateConfiguration(
    id: string,
    companyId: string,
    patch: AiEmployeeConfigurationUpdate,
    actorId?: string | null,
  ): Promise<AiEmployeeRecord> {
    const existing = await this.registry.getById(id, companyId);
    if (!existing) {
      throw new AiEmployeeRegistryError("AI Employee not found", "not_found");
    }

    const nextKnowledgeIds = patch.knowledgeSourceIds ?? existing.knowledgeSourceIds;
    const knowledgeNames = await this.resolveKnowledgeNames(companyId, nextKnowledgeIds);

    const nextRuntimeConfiguration = patch.runtimeConfiguration
      ? {
          ...existing.runtimeConfiguration,
          ...patch.runtimeConfiguration,
          runtimeFlags: {
            ...existing.runtimeConfiguration.runtimeFlags,
            ...(patch.runtimeConfiguration.runtimeFlags ?? {}),
          },
          retrievalPolicy: {
            ...existing.runtimeConfiguration.retrievalPolicy,
            ...(patch.runtimeConfiguration.retrievalPolicy ?? {}),
          },
          disabledToolKeys:
            patch.disabledToolKeys ??
            patch.runtimeConfiguration.disabledToolKeys ??
            existing.runtimeConfiguration.disabledToolKeys,
        }
      : patch.disabledToolKeys
        ? { ...existing.runtimeConfiguration, disabledToolKeys: patch.disabledToolKeys }
        : existing.runtimeConfiguration;

    const nextAllowedTools = patch.allowedToolKeys ?? existing.allowedToolKeys;
    const nextSkillIds = patch.allowedSkillIds ?? existing.allowedSkillIds;
    const nextPrompt = patch.systemPrompt ?? existing.systemPrompt;

    const skillRecords =
      nextSkillIds.length > 0 && this.skills != null
        ? await Promise.all(nextSkillIds.map((skillId) => this.skills!.getById(skillId, companyId)))
        : [];
    const skillNames = skillRecords.filter(Boolean).map((skill) => skill!.displayName);

    await this.repository.update(id, companyId, {
      provider: patch.provider ?? existing.provider,
      model: patch.model ?? existing.model,
      temperature: patch.temperature ?? existing.temperature,
      max_tokens: patch.maxTokens ?? existing.maxTokens,
      system_prompt: nextPrompt,
      system_prompt_summary: summarizeSystemPrompt(nextPrompt),
      welcome_message:
        patch.welcomeMessage != null
          ? normalizeAiEmployeeWelcomeMessageForStorage(patch.welcomeMessage)
          : existing.welcomeMessage,
      knowledge_source_ids: nextKnowledgeIds,
      knowledge_summary: summarizeKnowledge(knowledgeNames),
      allowed_tool_keys: nextAllowedTools,
      tool_summary: summarizeTools(nextAllowedTools),
      allowed_skill_ids: nextSkillIds,
      skills_summary: summarizeSkills(skillNames),
      prompt_version_label: patch.promptVersionLabel ?? existing.promptVersionLabel,
      runtime_configuration: nextRuntimeConfiguration,
      has_unpublished_draft: true,
      updated_by: actorId ?? null,
    });

    const changeEvent = resolveConfigurationChangeEvent(patch);
    if (changeEvent && this.lifecycle) {
      await this.lifecycle.recordChangeEvent({
        companyId,
        employeeId: id,
        eventType: changeEvent,
        metadata: { fields: Object.keys(patch) },
        actorId,
      });
    }

    const updated = await this.registry.getById(id, companyId);
    if (!updated) {
      throw new AiEmployeeRegistryError("AI Employee not found", "not_found");
    }
    return updated;
  }

  private async resolveKnowledgeNames(companyId: string, sourceIds: string[]): Promise<string[]> {
    if (sourceIds.length === 0) return [];
    const sources = await this.repository.listKnowledgeSources(companyId);
    const byId = new Map(sources.map((source) => [source.id, source.name]));
    return sourceIds.map((id) => byId.get(id) ?? id);
  }
}

function resolveConfigurationChangeEvent(
  patch: AiEmployeeConfigurationUpdate,
): import("@/lib/ai-employees/types").AiEmployeeChangeEventType | null {
  if (patch.systemPrompt != null || patch.promptVersionLabel != null || patch.welcomeMessage != null) {
    return "prompt_updated";
  }
  if (patch.knowledgeSourceIds != null) return "knowledge_updated";
  if (patch.allowedToolKeys != null || patch.disabledToolKeys != null || patch.allowedSkillIds != null) {
    return "tools_updated";
  }
  if (patch.runtimeConfiguration != null || patch.temperature != null || patch.maxTokens != null) {
    return "runtime_updated";
  }
  if (patch.provider != null || patch.model != null) return "runtime_updated";
  return null;
}
