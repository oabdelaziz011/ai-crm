import type { ServiceContext, WorkflowGraphSnapshot } from "@workspace/automation-platform";
import {
  WorkflowAuditService,
  WorkflowLifecycleService,
  WorkflowPublishService,
  WorkflowRollbackService,
  compareWorkflowSnapshots,
  createSupabaseAutomationEdgeRepository,
  createSupabaseAutomationFlowRepository,
  createSupabaseAutomationNodeRepository,
  createSupabaseAutomationFlowVersionRepository,
  type AutomationFlowVersionRecord,
} from "@workspace/automation-platform";
import type { SupabaseClient } from "@supabase/supabase-js";
import { documentToSnapshot } from "../lifecycle/snapshot-mapper";
import { createDefaultDocument, mapDocumentToPersistence, mapFlowToDocument } from "./workflow-mapper";
import type { WorkflowDocument, WorkflowSummary, WorkflowVersionSummary } from "../types";
import { validateWorkflow, hasBlockingValidationIssues } from "../validation/workflow-validator";

export type CreateWorkflowInput = {
  companyId: string;
  name: string;
  description?: string;
};

export interface WorkflowRepository {
  list(companyId: string): Promise<WorkflowSummary[]>;
  load(flowId: string): Promise<WorkflowDocument | null>;
  loadVersion(versionId: string): Promise<WorkflowDocument | null>;
  create(ctx: ServiceContext, input: CreateWorkflowInput): Promise<WorkflowDocument>;
  save(ctx: ServiceContext, document: WorkflowDocument): Promise<WorkflowDocument>;
  publish(ctx: ServiceContext, document: WorkflowDocument, releaseNotes?: string): Promise<WorkflowDocument>;
  listVersions(flowId: string): Promise<WorkflowVersionSummary[]>;
  compareVersions(leftVersionId: string, rightVersionId: string): Promise<ReturnType<typeof compareWorkflowSnapshots>>;
  rollback(ctx: ServiceContext, flowId: string, targetVersionNumber: number): Promise<WorkflowDocument>;
  archive(ctx: ServiceContext, flowId: string): Promise<void>;
  getLifecycle(ctx: ServiceContext, flowId: string): Promise<{
    versions: WorkflowVersionSummary[];
    audit: Array<{ action: string; timestamp: string; versionNumber?: number }>;
  }>;
}

function buildEdgeCondition(edge: WorkflowDocument["edges"][number]): Record<string, unknown> {
  const condition: Record<string, unknown> = {};
  if (edge.branchKey === "yes" || edge.branchKey === "no") condition.branch = edge.branchKey;
  else if (edge.branchKey) condition.case = edge.branchKey;
  if (edge.branchLabel) condition.label = edge.branchLabel;
  return condition;
}

function versionToSummary(version: AutomationFlowVersionRecord, activeVersionId: string | null): WorkflowVersionSummary {
  return {
    versionId: version.id,
    versionNumber: version.version_number,
    releaseNotes: version.release_notes,
    publishedAt: version.published_at,
    publishedBy: version.published_by,
    status: version.status,
    isActive: version.id === activeVersionId,
  };
}

function attachLifecycle(document: WorkflowDocument, flow: { active_version_id: string | null; has_unpublished_draft: boolean; version: number }): WorkflowDocument {
  return {
    ...document,
    activeVersionId: flow.active_version_id,
    activeVersionNumber: flow.version,
    hasUnpublishedDraft: flow.has_unpublished_draft,
  };
}

export function createSupabaseWorkflowRepository(client: SupabaseClient): WorkflowRepository {
  const flows = createSupabaseAutomationFlowRepository(client);
  const nodes = createSupabaseAutomationNodeRepository(client);
  const edges = createSupabaseAutomationEdgeRepository(client);
  const versions = createSupabaseAutomationFlowVersionRepository(client);
  const audit = new WorkflowAuditService();
  const lifecycle = new WorkflowLifecycleService(flows, versions, audit);
  const publishService = new WorkflowPublishService(flows, versions, audit);
  const rollbackService = new WorkflowRollbackService(flows, versions, nodes, edges, audit);

  return {
    async list(companyId) {
      const records = await flows.list({ companyId });
      const summaries = await Promise.all(
        records.map(async (flow) => {
          const nodeRecords = await nodes.listByFlowId(flow.id);
          return {
            flowId: flow.id,
            name: flow.name,
            description: flow.description,
            status: flow.status,
            updatedAt: flow.updated_at,
            nodeCount: nodeRecords.length,
            activeVersionNumber: flow.version,
            hasUnpublishedDraft: flow.has_unpublished_draft,
          } satisfies WorkflowSummary;
        }),
      );
      return summaries;
    },

    async load(flowId) {
      const flow = await flows.findById(flowId);
      if (!flow) return null;
      const [nodeRecords, edgeRecords] = await Promise.all([nodes.listByFlowId(flowId), edges.listByFlowId(flowId)]);
      return attachLifecycle(mapFlowToDocument(flow, nodeRecords, edgeRecords), flow);
    },

    async loadVersion(versionId) {
      const version = await versions.findById(versionId);
      if (!version) return null;
      const flow = await flows.findById(version.flow_id);
      if (!flow) return null;
      const snapshot = version.snapshot;
      return {
        flowId: flow.id,
        companyId: flow.company_id,
        name: snapshot.name,
        description: snapshot.description,
        triggerType: snapshot.triggerType,
        status: flow.status,
        viewport: (snapshot.metadata.builderViewport as WorkflowDocument["viewport"]) ?? { x: 0, y: 0, zoom: 1 },
        nodes: snapshot.nodes.map((node) => ({
          id: node.id,
          type: (node.config.builderType as WorkflowDocument["nodes"][number]["type"]) ?? "send_message",
          position: { x: node.positionX, y: node.positionY },
          config: node.config,
        })),
        edges: snapshot.edges.map((edge) => ({
          id: edge.id,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          branchKey: (edge.condition.branch as string | undefined) ?? (edge.condition.case as string | undefined),
          branchLabel: edge.condition.label as string | undefined,
        })),
        activeVersionId: flow.active_version_id,
        activeVersionNumber: version.version_number,
        hasUnpublishedDraft: flow.has_unpublished_draft,
        readOnly: true,
      };
    },

    async create(ctx, input) {
      const flow = await flows.create({
        companyId: input.companyId,
        name: input.name,
        description: input.description ?? "",
        triggerType: "inbound_message",
        createdBy: ctx.userId,
      });
      audit.record({
        flowId: flow.id,
        companyId: flow.company_id,
        action: "workflow_created",
        userId: ctx.userId,
      });
      return createDefaultDocument({ flowId: flow.id, companyId: flow.company_id, name: flow.name });
    },

    async save(ctx, document) {
      const existing = await flows.findById(document.flowId);
      if (!existing) throw new Error("Workflow not found.");
      if (existing.status === "archived") throw new Error("Archived workflows cannot be edited.");

      await lifecycle.beginDraftEdit(ctx, document.flowId);
      await flows.update({
        flowId: document.flowId,
        name: document.name,
        description: document.description,
        triggerType: document.triggerType,
        metadata: mapDocumentToPersistence(document).metadata,
        updatedBy: ctx.userId,
      });

      await nodes.deleteByFlowId(document.flowId);
      await edges.deleteByFlowId(document.flowId);

      const persistence = mapDocumentToPersistence(document);
      const createdNodes = await Promise.all(persistence.nodes.map((node) => nodes.create(node)));
      const nodeIdMap = new Map<string, string>();
      document.nodes.forEach((node, index) => {
        nodeIdMap.set(node.id, createdNodes[index]?.id ?? node.id);
      });

      const remappedDocument: WorkflowDocument = {
        ...document,
        nodes: document.nodes.map((node, index) => ({
          ...node,
          id: createdNodes[index]?.id ?? node.id,
        })),
        edges: document.edges.map((edge) => ({
          ...edge,
          id: `${nodeIdMap.get(edge.source) ?? edge.source}->${nodeIdMap.get(edge.target) ?? edge.target}`,
          source: nodeIdMap.get(edge.source) ?? edge.source,
          target: nodeIdMap.get(edge.target) ?? edge.target,
        })),
      };

      await Promise.all(
        remappedDocument.edges.map((edge) =>
          edges.create({
            flowId: document.flowId,
            sourceNodeId: edge.source,
            targetNodeId: edge.target,
            condition: buildEdgeCondition(edge),
          }),
        ),
      );

      await lifecycle.markDraftSaved(ctx, document.flowId);
      const flow = await flows.findById(document.flowId);
      return attachLifecycle(remappedDocument, flow!);
    },

    async publish(ctx, document, releaseNotes) {
      const issues = validateWorkflow(document);
      if (hasBlockingValidationIssues(issues)) {
        throw new Error(issues[0]?.message ?? "This workflow is not ready to publish yet.");
      }
      const saved = await this.save(ctx, document);
      const result = await publishService.publish(ctx, {
        flowId: saved.flowId,
        snapshot: documentToSnapshot(saved),
        releaseNotes,
      });
      return attachLifecycle({ ...saved, status: "active" }, result.flow);
    },

    async listVersions(flowId) {
      const flow = await flows.findById(flowId);
      if (!flow) return [];
      const records = await versions.listByFlowId(flowId);
      return records.map((version) => versionToSummary(version, flow.active_version_id));
    },

    async compareVersions(leftVersionId, rightVersionId) {
      const [left, right] = await Promise.all([versions.findById(leftVersionId), versions.findById(rightVersionId)]);
      if (!left || !right) throw new Error("One or both versions could not be found.");
      return compareWorkflowSnapshots(left.snapshot, right.snapshot);
    },

    async rollback(ctx, flowId, targetVersionNumber) {
      const result = await rollbackService.rollback(ctx, { flowId, targetVersionNumber, restoreDraft: true });
      return (await this.load(flowId)) ?? attachLifecycle(createDefaultDocument({ flowId, companyId: result.flow.company_id, name: result.flow.name }), result.flow);
    },

    async archive(ctx, flowId) {
      await lifecycle.archiveFlow(ctx, flowId);
    },

    async getLifecycle(ctx, flowId) {
      const state = await lifecycle.getLifecycle(ctx, flowId);
      return {
        versions: state.versions.map((version) => versionToSummary(version, state.flow.active_version_id)),
        audit: state.audit.map((entry) => ({
          action: entry.action,
          timestamp: entry.timestamp,
          versionNumber: entry.versionNumber,
        })),
      };
    },
  };
}
