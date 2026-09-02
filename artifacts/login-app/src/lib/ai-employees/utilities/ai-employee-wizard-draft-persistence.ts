import { isArchivedAiEmployeeStatus } from "@/lib/ai-employees/services/assert-ai-employee-safe-to-archive";

export type WizardDraftPersistDecision =
  | { mode: "create" }
  | { mode: "update"; draftId: string }
  | { mode: "blocked"; reason: "draft_loading" | "draft_not_found" | "archived" };

/**
 * Pure decision for create-wizard persist path.
 * When URL or state indicates draft resume, INSERT (create) is never allowed.
 */
export function resolveWizardDraftPersistDecision(input: {
  urlDraftId: string | null;
  stateDraftId: string | null;
  loadedDraft: { id: string; status: string } | null | undefined;
  isDraftLoading: boolean;
}): WizardDraftPersistDecision {
  const resumeId = input.urlDraftId ?? input.stateDraftId;
  if (!resumeId) {
    return { mode: "create" };
  }
  if (input.isDraftLoading) {
    return { mode: "blocked", reason: "draft_loading" };
  }
  if (!input.loadedDraft || input.loadedDraft.id !== resumeId) {
    return { mode: "blocked", reason: "draft_not_found" };
  }
  if (isArchivedAiEmployeeStatus(input.loadedDraft.status)) {
    return { mode: "blocked", reason: "archived" };
  }
  return { mode: "update", draftId: resumeId };
}
