import type { AiEmployeeWizardStep } from "@/lib/ai-employees/components/ai-employee-form-sections";

/**
 * Maps legacy detail deep links (`?tab=setup&config=…`, `?tab=channels`, `?tab=knowledge`)
 * to the create / edit wizard step that now owns that data.
 */
export function legacyDetailTabToWizardStep(
  tab: string | null,
  config: string | null,
): AiEmployeeWizardStep | null {
  if (tab === "channels") return "channels";
  if (tab === "knowledge") return "tools";
  if (tab !== "setup") return null;
  switch (config) {
    case "prompt":
      return "prompt";
    case "provider":
    case "model":
    case "runtime":
    case "limits":
      return "intelligence";
    case "knowledge":
      return "knowledge";
    case "tools":
      return "tools";
    case "preview":
      return "review";
    default:
      return "general";
  }
}

/** Wizard step that fixes a readiness category reported by lifecycle validation. */
export function readinessCategoryToWizardStep(categoryId: string): AiEmployeeWizardStep {
  switch (categoryId) {
    case "prompt":
      return "prompt";
    case "provider":
    case "model":
    case "runtime":
    case "limits":
      return "intelligence";
    case "knowledge":
      return "knowledge";
    case "tools":
    case "permissions":
      return "tools";
    default:
      return "general";
  }
}

export function haveSameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}
