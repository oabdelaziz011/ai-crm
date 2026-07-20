import type { AutomationFlowVersionRepository } from "../lifecycle/version-repository.js";
import type { AutomationFlowVersionRecord, CreateAutomationFlowVersionInput } from "../lifecycle/types.js";

export function createNoopAutomationFlowVersionRepository(): AutomationFlowVersionRepository {
  return {
    create: async (input: CreateAutomationFlowVersionInput) =>
      ({
        id: "version-1",
        flow_id: input.flowId,
        company_id: input.companyId,
        version_number: input.versionNumber,
        status: "published",
        release_notes: input.releaseNotes ?? "",
        snapshot: input.snapshot,
        is_active: false,
        is_immutable: true,
        published_at: new Date().toISOString(),
        published_by: input.publishedBy ?? null,
        created_at: new Date().toISOString(),
      }) satisfies AutomationFlowVersionRecord,
    findById: async () => null,
    findByFlowAndNumber: async () => null,
    findActiveByFlowId: async () => null,
    listByFlowId: async () => [],
    setActiveVersion: async (_flowId, versionId) =>
      ({
        id: versionId,
        flow_id: "flow-1",
        company_id: "company-1",
        version_number: 1,
        status: "published",
        release_notes: "",
        snapshot: { name: "", description: "", triggerType: "manual", metadata: {}, nodes: [], edges: [] },
        is_active: true,
        is_immutable: true,
        published_at: new Date().toISOString(),
        published_by: null,
        created_at: new Date().toISOString(),
      }) satisfies AutomationFlowVersionRecord,
    getNextVersionNumber: async () => 1,
  };
}
