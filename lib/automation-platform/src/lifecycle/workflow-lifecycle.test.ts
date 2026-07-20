import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AutomationFlowVersionNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type {
  AutomationEdgeRepository,
  AutomationFlowRepository,
  AutomationNodeRepository,
} from "../repositories/automation-repositories.js";
import type { AutomationFlowRecord, ServiceContext } from "../types.js";
import { WorkflowAuditService } from "./audit-service.js";
import { compareWorkflowSnapshots } from "./compare-service.js";
import { WorkflowLifecycleService } from "./lifecycle-service.js";
import { validateWorkflowSnapshot } from "./publish-validation.js";
import { WorkflowPublishService } from "./publish-service.js";
import { WorkflowRollbackService } from "./rollback-service.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";
import type { WorkflowGraphSnapshot } from "./types.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      [
        "automation.view",
        "automation.edit",
        "automation.publish",
        "automation.rollback",
        "automation.archive",
      ].includes(code),
    ...overrides,
  };
}

const validSnapshot: WorkflowGraphSnapshot = {
  name: "Pricing Journey",
  description: "Route VIP customers",
  triggerType: "inbound_message",
  metadata: { builderViewport: { x: 0, y: 0, zoom: 1 } },
  nodes: [
    { id: "n1", type: "trigger", config: { builderType: "start" }, positionX: 0, positionY: 0 },
    { id: "n2", type: "end", config: { builderType: "end" }, positionX: 0, positionY: 120 },
  ],
  edges: [{ id: "e1", sourceNodeId: "n1", targetNodeId: "n2", condition: {} }],
};

function createLifecycleEnvironment() {
  const flows: AutomationFlowRecord[] = [];
  const versionRecords: Array<{
    id: string;
    flow_id: string;
    company_id: string;
    version_number: number;
    status: "published" | "archived";
    release_notes: string;
    snapshot: WorkflowGraphSnapshot;
    is_active: boolean;
    is_immutable: boolean;
    published_at: string | null;
    published_by: string | null;
    created_at: string;
  }> = [];

  const flowRepository: AutomationFlowRepository = {
    create: async (input) => {
      const record: AutomationFlowRecord = {
        id: `flow-${flows.length + 1}`,
        company_id: input.companyId,
        name: input.name,
        description: input.description ?? "",
        trigger_type: input.triggerType,
        status: "draft",
        version: 0,
        active_version_id: null,
        has_unpublished_draft: true,
        metadata: input.metadata ?? {},
        created_by: input.createdBy ?? null,
        updated_by: input.createdBy ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };
      flows.push(record);
      return record;
    },
    update: async (input) => {
      const record = flows.find((item) => item.id === input.flowId)!;
      if (input.name !== undefined) record.name = input.name;
      if (input.description !== undefined) record.description = input.description;
      if (input.triggerType !== undefined) record.trigger_type = input.triggerType;
      if (input.metadata !== undefined) record.metadata = input.metadata;
      if (input.activeVersionId !== undefined) record.active_version_id = input.activeVersionId;
      if (input.version !== undefined) record.version = input.version;
      if (input.hasUnpublishedDraft !== undefined) record.has_unpublished_draft = input.hasUnpublishedDraft;
      if (input.status !== undefined) record.status = input.status;
      record.updated_by = input.updatedBy ?? record.updated_by;
      return record;
    },
    updateStatus: async (flowId, status, updatedBy) => {
      const record = flows.find((item) => item.id === flowId)!;
      record.status = status;
      record.updated_by = updatedBy ?? record.updated_by;
      return record;
    },
    softDelete: async (input) => {
      const record = flows.find((item) => item.id === input.id)!;
      record.deleted_at = new Date().toISOString();
      return record;
    },
    findById: async (id) => flows.find((item) => item.id === id && !item.deleted_at) ?? null,
    findByName: async () => null,
    list: async (filter) => flows.filter((item) => item.company_id === filter.companyId),
  };

  const versionRepository: AutomationFlowVersionRepository = {
    create: async (input) => {
      const record = {
        id: `version-${versionRecords.length + 1}`,
        flow_id: input.flowId,
        company_id: input.companyId,
        version_number: input.versionNumber,
        status: "published" as const,
        release_notes: input.releaseNotes ?? "",
        snapshot: structuredClone(input.snapshot),
        is_active: false,
        is_immutable: true,
        published_at: new Date().toISOString(),
        published_by: input.publishedBy ?? null,
        created_at: new Date().toISOString(),
      };
      versionRecords.push(record);
      return record;
    },
    findById: async (id) => versionRecords.find((item) => item.id === id) ?? null,
    findByFlowAndNumber: async (flowId, versionNumber) =>
      versionRecords.find((item) => item.flow_id === flowId && item.version_number === versionNumber) ?? null,
    findActiveByFlowId: async (flowId) => versionRecords.find((item) => item.flow_id === flowId && item.is_active) ?? null,
    listByFlowId: async (flowId) => versionRecords.filter((item) => item.flow_id === flowId),
    setActiveVersion: async (flowId, versionId) => {
      for (const item of versionRecords) {
        item.is_active = item.flow_id === flowId && item.id === versionId;
      }
      return versionRecords.find((item) => item.id === versionId)!;
    },
    getNextVersionNumber: async (flowId) => {
      const latest = versionRecords.filter((item) => item.flow_id === flowId).sort((a, b) => b.version_number - a.version_number)[0];
      return latest ? latest.version_number + 1 : 1;
    },
  };

  const nodeRepository: AutomationNodeRepository = {
    create: async (input) => ({
      id: `node-${input.flowId}-${Math.random()}`,
      flow_id: input.flowId,
      type: input.type,
      config: input.config ?? {},
      position_x: input.positionX ?? 0,
      position_y: input.positionY ?? 0,
      created_at: new Date().toISOString(),
    }),
    listByFlowId: async () => [],
    deleteByFlowId: async () => undefined,
  };

  const edgeRepository: AutomationEdgeRepository = {
    create: async (input) => ({
      id: `edge-${input.sourceNodeId}-${input.targetNodeId}`,
      flow_id: input.flowId,
      source_node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
      condition: input.condition ?? {},
      created_at: new Date().toISOString(),
    }),
    listByFlowId: async () => [],
    deleteByFlowId: async () => undefined,
  };

  const audit = new WorkflowAuditService();
  const publish = new WorkflowPublishService(flowRepository, versionRepository, audit);
  const rollback = new WorkflowRollbackService(flowRepository, versionRepository, nodeRepository, edgeRepository, audit);
  const lifecycle = new WorkflowLifecycleService(flowRepository, versionRepository, audit);

  return { flows, versionRecords, publish, rollback, lifecycle, audit };
}

describe("workflow lifecycle", () => {
  it("creates immutable published versions with release notes", async () => {
    const env = createLifecycleEnvironment();
    env.flows.push({
      id: "flow-1",
      company_id: "company-1",
      name: "Pricing Journey",
      description: "",
      trigger_type: "inbound_message",
      status: "draft",
      version: 0,
      active_version_id: null,
      has_unpublished_draft: true,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    });

    const result = await env.publish.publish(createContext(), {
      flowId: "flow-1",
      snapshot: validSnapshot,
      releaseNotes: "Initial production release",
    });

    assert.equal(result.version.version_number, 1);
    assert.equal(result.flow.status, "active");
    assert.equal(result.flow.active_version_id, result.version.id);
    assert.equal(env.audit.listByFlowId("flow-1")[0]?.action, "published");
  });

  it("blocks publish when validation fails", async () => {
    const env = createLifecycleEnvironment();
    env.flows.push({
      id: "flow-1",
      company_id: "company-1",
      name: "",
      description: "",
      trigger_type: "manual",
      status: "draft",
      version: 0,
      active_version_id: null,
      has_unpublished_draft: true,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    });

    await assert.rejects(
      () => env.publish.publish(createContext(), { flowId: "flow-1", snapshot: { ...validSnapshot, name: "" } }),
      ValidationError,
    );
  });

  it("rolls back to a previous published version", async () => {
    const env = createLifecycleEnvironment();
    env.flows.push({
      id: "flow-1",
      company_id: "company-1",
      name: "Pricing Journey",
      description: "",
      trigger_type: "inbound_message",
      status: "active",
      version: 2,
      active_version_id: "version-2",
      has_unpublished_draft: false,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    });
    env.versionRecords.push(
      {
        id: "version-1",
        flow_id: "flow-1",
        company_id: "company-1",
        version_number: 1,
        status: "published",
        release_notes: "Stable",
        snapshot: validSnapshot,
        is_active: false,
        is_immutable: true,
        published_at: new Date().toISOString(),
        published_by: "user-1",
        created_at: new Date().toISOString(),
      },
      {
        id: "version-2",
        flow_id: "flow-1",
        company_id: "company-1",
        version_number: 2,
        status: "published",
        release_notes: "Broken",
        snapshot: { ...validSnapshot, name: "Broken Journey" },
        is_active: true,
        is_immutable: true,
        published_at: new Date().toISOString(),
        published_by: "user-1",
        created_at: new Date().toISOString(),
      },
    );

    const result = await env.rollback.rollback(createContext(), { flowId: "flow-1", targetVersionNumber: 1 });
    assert.equal(result.version.version_number, 1);
    assert.equal(result.flow.active_version_id, "version-1");
    assert.equal(env.audit.listByFlowId("flow-1").some((entry) => entry.action === "rolled_back"), true);
  });

  it("compares versions without exposing raw JSON diffs", async () => {
    const comparison = compareWorkflowSnapshots(validSnapshot, {
      ...validSnapshot,
      nodes: [
        ...validSnapshot.nodes,
        { id: "n3", type: "action", config: { builderType: "send_message", action: "send_message" }, positionX: 0, positionY: 240 },
      ],
    });
    assert.ok(comparison.addedNodes.length >= 1);
  });

  it("enforces rollback permission", async () => {
    const env = createLifecycleEnvironment();
    env.flows.push({
      id: "flow-1",
      company_id: "company-1",
      name: "Pricing Journey",
      description: "",
      trigger_type: "inbound_message",
      status: "active",
      version: 1,
      active_version_id: "version-1",
      has_unpublished_draft: false,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    });
    env.versionRecords.push({
      id: "version-1",
      flow_id: "flow-1",
      company_id: "company-1",
      version_number: 1,
      status: "published",
      release_notes: "",
      snapshot: validSnapshot,
      is_active: true,
      is_immutable: true,
      published_at: new Date().toISOString(),
      published_by: "user-1",
      created_at: new Date().toISOString(),
    });

    await assert.rejects(
      () =>
        env.rollback.rollback(createContext({ hasPermission: (code) => code === "automation.view" }), {
          flowId: "flow-1",
          targetVersionNumber: 1,
        }),
      PermissionDeniedError,
    );
  });

  it("validates publish snapshots", () => {
    const issues = validateWorkflowSnapshot({ ...validSnapshot, nodes: [], edges: [] });
    assert.ok(issues.some((issue) => issue.id === "missing-start"));
  });

  it("throws when rollback target is missing", async () => {
    const env = createLifecycleEnvironment();
    env.flows.push({
      id: "flow-1",
      company_id: "company-1",
      name: "Pricing Journey",
      description: "",
      trigger_type: "inbound_message",
      status: "active",
      version: 1,
      active_version_id: null,
      has_unpublished_draft: false,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    });

    await assert.rejects(
      () => env.rollback.rollback(createContext(), { flowId: "flow-1", targetVersionNumber: 99 }),
      AutomationFlowVersionNotFoundError,
    );
  });

  it("archives workflows through lifecycle service", async () => {
    const env = createLifecycleEnvironment();
    env.flows.push({
      id: "flow-1",
      company_id: "company-1",
      name: "Old Journey",
      description: "",
      trigger_type: "manual",
      status: "active",
      version: 1,
      active_version_id: null,
      has_unpublished_draft: false,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    });

    const archived = await env.lifecycle.archiveFlow(createContext(), "flow-1");
    assert.equal(archived.status, "archived");
  });
});
