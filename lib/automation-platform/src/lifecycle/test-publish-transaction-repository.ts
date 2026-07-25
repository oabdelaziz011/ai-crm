import type { AutomationFlowRecord } from "../types.js";
import type { AutomationFlowVersionRecord } from "./types.js";
import type {
  AtomicPublishWorkflowInput,
  AtomicPublishWorkflowResult,
  WorkflowPublishTransactionRepository,
} from "./publish-transaction-repository.js";
import type { AutomationFlowRepository } from "../repositories/automation-repositories.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";
import type { AutomationFlowVersionGraphRepository } from "./version-graph-repository.js";

export function createInMemoryWorkflowPublishTransactionRepository(deps: {
  flows: AutomationFlowRepository;
  versions: AutomationFlowVersionRepository;
  versionGraph: AutomationFlowVersionGraphRepository;
}): WorkflowPublishTransactionRepository {
  return {
    async publishAtomically(input): Promise<AtomicPublishWorkflowResult> {
      const flow = await deps.flows.findById(input.flowId);
      if (!flow) {
        throw new Error(`Automation flow ${input.flowId} not found.`);
      }

      const previousActiveVersionId = flow.active_version_id;
      let createdVersion: AutomationFlowVersionRecord | null = null;

      try {
        const versionNumber = await deps.versions.getNextVersionNumber(input.flowId);
        createdVersion = await deps.versions.create({
          flowId: input.flowId,
          companyId: input.companyId,
          versionNumber,
          releaseNotes: input.releaseNotes,
          snapshot: input.snapshot,
          publishedBy: input.publishedBy,
        });

        await deps.versionGraph.materialize({
          flowVersionId: createdVersion.id,
          flowId: input.flowId,
          snapshot: input.snapshot,
        });

        const activeVersion = await deps.versions.setActiveVersion(input.flowId, createdVersion.id);
        const updatedFlow = await deps.flows.update({
          flowId: input.flowId,
          name: input.snapshot.name,
          description: input.snapshot.description,
          triggerType: input.snapshot.triggerType,
          metadata: input.snapshot.metadata,
          updatedBy: input.updatedBy ?? null,
          activeVersionId: activeVersion.id,
          version: versionNumber,
          hasUnpublishedDraft: false,
          status: "active",
        });

        return { flow: updatedFlow, version: activeVersion };
      } catch (error) {
        if (createdVersion) {
          if (previousActiveVersionId) {
            await deps.versions.setActiveVersion(input.flowId, previousActiveVersionId).catch(() => undefined);
          }
        }
        throw error;
      }
    },
  };
}
