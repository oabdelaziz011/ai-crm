import { useQuery } from "@tanstack/react-query";
import type { PromptTemplateRecord } from "@workspace/ai-prompt-orchestrator";
import { usePromptOrchestratorServices } from "@/lib/ai-prompt-orchestrator";

export function usePromptTemplates(companyId: string | null, enabled = true) {
  const { services, context } = usePromptOrchestratorServices();

  return useQuery<PromptTemplateRecord[]>({
    queryKey: ["prompt-templates", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: () =>
      services.templates.listTemplates(context, {
        companyId: companyId ?? undefined,
        includeSystem: true,
        includeDisabled: true,
      }),
  });
}

export function usePromptTemplateVersions(templateId: string | null, enabled = true) {
  const { services, context } = usePromptOrchestratorServices();

  return useQuery({
    queryKey: ["prompt-template-versions", templateId],
    enabled: enabled && Boolean(templateId),
    queryFn: () => services.templates.getTemplateVersions(context, templateId!),
  });
}
