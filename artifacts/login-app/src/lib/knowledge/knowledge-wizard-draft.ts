import type { KnowledgeSourceRecord } from "@workspace/knowledge-platform";

export type KnowledgeWizardStep = "source" | "import" | "documents" | "verify";

export type KnowledgeWizardDraftMeta = {
  status: "draft" | "ready";
  step: KnowledgeWizardStep;
  updatedAt: string;
};

const STEPS: KnowledgeWizardStep[] = ["source", "import", "documents", "verify"];

export function isKnowledgeWizardStep(value: unknown): value is KnowledgeWizardStep {
  return typeof value === "string" && (STEPS as string[]).includes(value);
}

export function readKnowledgeWizardDraft(
  source: Pick<KnowledgeSourceRecord, "metadata"> | null | undefined,
): KnowledgeWizardDraftMeta | null {
  const raw = source?.metadata?.wizard;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const status = record.status === "ready" ? "ready" : record.status === "draft" ? "draft" : null;
  if (!status || !isKnowledgeWizardStep(record.step)) return null;
  return {
    status,
    step: record.step,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

export function buildKnowledgeWizardDraftMeta(
  step: KnowledgeWizardStep,
  status: "draft" | "ready" = "draft",
): KnowledgeWizardDraftMeta {
  return {
    status,
    step,
    updatedAt: new Date().toISOString(),
  };
}

export function knowledgeWizardStepIndex(step: KnowledgeWizardStep): number {
  return Math.max(0, STEPS.indexOf(step));
}

export function isKnowledgeWizardDraft(source: Pick<KnowledgeSourceRecord, "metadata">): boolean {
  return readKnowledgeWizardDraft(source)?.status === "draft";
}
