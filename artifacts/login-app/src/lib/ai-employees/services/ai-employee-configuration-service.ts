import type { AiEmployeeRepository } from "@/lib/ai-employees/repositories";
import { buildAgentRuntimeConfiguration } from "@/lib/ai-employees/adapters/ai-employee-runtime-adapter";
import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import { buildToolMetadataCatalog } from "@/lib/ai-employees/adapters/tool-metadata-adapter";
import type { AiEmployeeConfigurationUpdate, AiEmployeeRecord } from "@/lib/ai-employees/types";
import type { RuntimeChatExecutionConfig } from "@/lib/runtime-integration/chat-config";
import {
  summarizeKnowledge,
  summarizeSystemPrompt,
  summarizeTools,
} from "@/lib/ai-employees/selectors";
import { AiEmployeeRegistryError } from "./ai-employee-errors";
import type { AiEmployeeRegistryService } from "./ai-employee-registry-service";

export type TenantRuntimeContext = {
  companyId: string;
  config: RuntimeChatExecutionConfig;
  providerConnectionName: string | null;
  providerRegistryKey: string | null;
  collectionName: string | null;
  availableModels: string[];
};

export class AiEmployeeConfigurationService {
  constructor(
    private readonly registry: AiEmployeeRegistryService,
    private readonly repository: AiEmployeeRepository,
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
        knowledgeSourceIds: employee.knowledgeSourceIds,
        allowedToolKeys: employee.allowedToolKeys,
        promptVersionLabel: employee.promptVersionLabel,
        runtimeConfiguration: employee.runtimeConfiguration,
      },
      tenantRuntime: {
        providerConnectionId: tenantRuntime.config.providerConnectionId,
        providerConnectionName: tenantRuntime.providerConnectionName,
        providerRegistryKey: tenantRuntime.providerRegistryKey,
        knowledgeRetrieval: tenantRuntime.config.knowledgeRetrieval
          ? {
              ...tenantRuntime.config.knowledgeRetrieval,
              collectionName: tenantRuntime.collectionName,
            }
          : null,
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
    const nextPrompt = patch.systemPrompt ?? existing.systemPrompt;

    await this.repository.update(id, companyId, {
      provider: patch.provider ?? existing.provider,
      model: patch.model ?? existing.model,
      temperature: patch.temperature ?? existing.temperature,
      max_tokens: patch.maxTokens ?? existing.maxTokens,
      system_prompt: nextPrompt,
      system_prompt_summary: summarizeSystemPrompt(nextPrompt),
      knowledge_source_ids: nextKnowledgeIds,
      knowledge_summary: summarizeKnowledge(knowledgeNames),
      allowed_tool_keys: nextAllowedTools,
      tool_summary: summarizeTools(nextAllowedTools),
      prompt_version_label: patch.promptVersionLabel ?? existing.promptVersionLabel,
      runtime_configuration: nextRuntimeConfiguration,
      updated_by: actorId ?? null,
    });

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
