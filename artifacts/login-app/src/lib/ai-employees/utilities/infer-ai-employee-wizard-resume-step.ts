import type { AiEmployeeFormValues } from "@/lib/ai-employees/types";

/**
 * Resume Continue Setup at the first incomplete wizard step.
 * Knowledge and tools are treated as incomplete when empty so Continue Setup
 * does not jump past them when channels are already configured.
 *
 * Step order must match create/edit STEPS:
 * general → prompt → intelligence → knowledge → tools → channels → review
 */
export function inferAiEmployeeWizardResumeStepIndex(
  values: Pick<
    AiEmployeeFormValues,
    | "displayName"
    | "systemPrompt"
    | "provider"
    | "model"
    | "knowledgeSourceIds"
    | "allowedToolKeys"
    | "tags"
  >,
): number {
  if (!values.displayName.trim()) return 0; // general
  if (!values.systemPrompt.trim()) return 1; // prompt
  if (!values.provider?.trim() || !values.model?.trim()) return 2; // intelligence
  if (values.knowledgeSourceIds.length === 0) return 3; // knowledge
  if (values.allowedToolKeys.length === 0) return 4; // tools
  if (!values.tags.some((tag) => tag.startsWith("channel:"))) return 5; // channels
  return 6; // review
}
