import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePromptTemplateInput,
  CreatePromptTemplateVersionInput,
  PromptSectionConfig,
  PromptSectionKey,
} from "@workspace/ai-prompt-orchestrator";
import { usePromptOrchestratorServices } from "@/lib/ai-prompt-orchestrator";
import { buildOutputContractFromSections } from "@/lib/prompts/output-contract";

export { buildOutputContractFromSections };

function invalidatePromptQueries(queryClient: ReturnType<typeof useQueryClient>, templateId?: string) {
  void queryClient.invalidateQueries({ queryKey: ["prompt-templates"] });
  if (templateId) {
    void queryClient.invalidateQueries({ queryKey: ["prompt-template-versions", templateId] });
  }
}

async function assertCompanyOwnedTemplate(
  services: ReturnType<typeof usePromptOrchestratorServices>["services"],
  context: ReturnType<typeof usePromptOrchestratorServices>["context"],
  templateId: string,
) {
  if (context.isSuperAdmin) return;
  const templates = await services.templates.listTemplates(context, {
    companyId: context.companyId ?? undefined,
    includeSystem: true,
    includeDisabled: true,
  });
  const template = templates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error("Prompt template not found.");
  }
  if (template.company_id === null) {
    throw new Error("System prompt templates are read-only.");
  }
  if (template.company_id !== context.companyId) {
    throw new Error("You do not have permission to modify this prompt template.");
  }
}

export function useCreatePromptTemplate() {
  const { services, context } = usePromptOrchestratorServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePromptTemplateInput) => services.templates.createTemplate(context, input),
    onSuccess: () => invalidatePromptQueries(queryClient),
  });
}

export function useSavePromptDraft() {
  const { services, context } = usePromptOrchestratorServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePromptTemplateVersionInput) => {
      await assertCompanyOwnedTemplate(services, context, input.templateId);
      return services.templates.createTemplateVersion(context, {
        ...input,
        activate: false,
        lifecycleStatus: input.lifecycleStatus ?? "draft",
      });
    },
    onSuccess: (version) => invalidatePromptQueries(queryClient, version.template_id),
  });
}

export function usePublishPromptDraft() {
  const { services, context } = usePromptOrchestratorServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePromptTemplateVersionInput & { knownVariables?: string[] }) => {
      await assertCompanyOwnedTemplate(services, context, input.templateId);
      return services.publish.publishDraft(context, input);
    },
    onSuccess: (result) => invalidatePromptQueries(queryClient, result.version.template_id),
  });
}

export function useRollbackPromptVersion() {
  const { services, context } = usePromptOrchestratorServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { templateId: string; versionId: string }) => {
      await assertCompanyOwnedTemplate(services, context, input.templateId);
      return services.rollback.rollback(context, input.templateId, input.versionId);
    },
    onSuccess: (version) => invalidatePromptQueries(queryClient, version.template_id),
  });
}

export function useSetPromptTemplateEnabled() {
  const { services, context } = usePromptOrchestratorServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { templateId: string; isEnabled: boolean }) => {
      await assertCompanyOwnedTemplate(services, context, input.templateId);
      return services.templates.setTemplateEnabled(context, input.templateId, input.isEnabled);
    },
    onSuccess: () => invalidatePromptQueries(queryClient),
  });
}

export function useCreatePromptFromPreset() {
  const { services, context } = usePromptOrchestratorServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      key: string;
      displayName: string;
      description?: string;
      templateType: CreatePromptTemplateInput["templateType"];
      sectionOrder: PromptSectionKey[];
      sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>;
    }) => {
      const template = await services.templates.createTemplate(context, {
        companyId: input.companyId,
        key: input.key,
        displayName: input.displayName,
        description: input.description,
        templateType: input.templateType,
        sectionOrder: input.sectionOrder,
      });

      const version = await services.templates.createTemplateVersion(context, {
        templateId: template.id,
        versionLabel: "1.0.0",
        sections: input.sections,
        outputContract: buildOutputContractFromSections(input.sections),
        changeNotes: "Created from library preset",
        activate: true,
        lifecycleStatus: "published",
      });

      return { template, version };
    },
    onSuccess: (result) => invalidatePromptQueries(queryClient, result.template.id),
  });
}
