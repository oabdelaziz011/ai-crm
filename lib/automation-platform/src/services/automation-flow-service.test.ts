import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AutomationFlowNotFoundError,
  AutomationFlowStateError,
  DuplicateAutomationFlowError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { AutomationFlowRepository } from "../repositories/automation-repositories.js";
import { AutomationFlowService } from "./automation-flow-service.js";
import type { AutomationFlowRecord, ServiceContext } from "../types.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      [
        "automation.view",
        "automation.create",
        "automation.edit",
        "automation.delete",
        "automation.publish",
        "automation.execute",
      ].includes(code),
    ...overrides,
  };
}

function createEnvironment() {
  const flows: AutomationFlowRecord[] = [];

  const flowRepository: AutomationFlowRepository = {
    create: async (input) => {
      const record: AutomationFlowRecord = {
        id: `flow-${flows.length + 1}`,
        company_id: input.companyId,
        name: input.name,
        description: input.description ?? "",
        trigger_type: input.triggerType,
        status: "draft",
        version: 1,
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
      const record = flows.find((item) => item.id === input.flowId && !item.deleted_at);
      if (!record) throw new AutomationFlowNotFoundError(input.flowId);
      if (input.name !== undefined) record.name = input.name;
      if (input.description !== undefined) record.description = input.description;
      if (input.triggerType !== undefined) record.trigger_type = input.triggerType;
      if (input.metadata !== undefined) record.metadata = input.metadata;
      record.updated_by = input.updatedBy ?? record.updated_by;
      record.updated_at = new Date().toISOString();
      return record;
    },
    updateStatus: async (flowId, status, updatedBy) => {
      const record = flows.find((item) => item.id === flowId && !item.deleted_at);
      if (!record) throw new AutomationFlowNotFoundError(flowId);
      record.status = status;
      record.updated_by = updatedBy ?? record.updated_by;
      record.updated_at = new Date().toISOString();
      return record;
    },
    softDelete: async (input) => {
      const record = flows.find((item) => item.id === input.id && !item.deleted_at);
      if (!record) throw new AutomationFlowNotFoundError(input.id);
      record.deleted_at = new Date().toISOString();
      record.deleted_by = input.deletedBy ?? null;
      record.status = "disabled";
      return record;
    },
    findById: async (id) => flows.find((item) => item.id === id && !item.deleted_at) ?? null,
    findByName: async (companyId, name) =>
      flows.find((item) => item.company_id === companyId && item.name === name && !item.deleted_at) ?? null,
    list: async (filter) =>
      flows.filter(
        (item) =>
          item.company_id === filter.companyId &&
          !item.deleted_at &&
          (!filter.status || item.status === filter.status) &&
          (!filter.triggerType || item.trigger_type === filter.triggerType) &&
          (!filter.search || item.name.toLowerCase().includes(filter.search.toLowerCase())),
      ),
  };

  return { flows, service: new AutomationFlowService(flowRepository) };
}

describe("AutomationFlowService", () => {
  it("creates a draft flow with automation.create permission", async () => {
    const { service } = createEnvironment();
    const flow = await service.createFlow(createContext(), {
      companyId: "company-1",
      name: "Welcome Journey",
      triggerType: "inbound_message",
      description: "Channel-agnostic onboarding",
    });
    assert.equal(flow.status, "draft");
    assert.equal(flow.name, "Welcome Journey");
  });

  it("rejects duplicate flow names within a company", async () => {
    const { service } = createEnvironment();
    await service.createFlow(createContext(), {
      companyId: "company-1",
      name: "Duplicate",
      triggerType: "manual",
    });
    await assert.rejects(
      () =>
        service.createFlow(createContext(), {
          companyId: "company-1",
          name: "Duplicate",
          triggerType: "manual",
        }),
      DuplicateAutomationFlowError,
    );
  });

  it("rejects create without permission", async () => {
    const { service } = createEnvironment();
    await assert.rejects(
      () =>
        service.createFlow(createContext({ hasPermission: () => false }), {
          companyId: "company-1",
          name: "Blocked",
          triggerType: "manual",
        }),
      PermissionDeniedError,
    );
  });

  it("rejects empty flow names", async () => {
    const { service } = createEnvironment();
    await assert.rejects(
      () =>
        service.createFlow(createContext(), {
          companyId: "company-1",
          name: "   ",
          triggerType: "manual",
        }),
      ValidationError,
    );
  });

  it("updates draft flows and allows draft edits while a flow stays published", async () => {
    const { service } = createEnvironment();
    const created = await service.createFlow(createContext(), {
      companyId: "company-1",
      name: "Editable",
      triggerType: "webhook",
    });
    const updated = await service.updateFlow(createContext(), {
      flowId: created.id,
      description: "Updated copy",
    });
    assert.equal(updated.description, "Updated copy");

    await service.publishFlow(createContext(), created.id);
    const editedWhilePublished = await service.updateFlow(createContext(), { flowId: created.id, name: "Published Draft Edits" });
    assert.equal(editedWhilePublished.name, "Published Draft Edits");
  });

  it("publishes and disables flows through lifecycle transitions", async () => {
    const { service } = createEnvironment();
    const created = await service.createFlow(createContext(), {
      companyId: "company-1",
      name: "Lifecycle",
      triggerType: "api_event",
    });
    const published = await service.publishFlow(createContext(), created.id);
    assert.equal(published.status, "active");

    const disabled = await service.disableFlow(createContext(), created.id);
    assert.equal(disabled.status, "disabled");
  });

  it("requires publish permission to activate flows", async () => {
    const { service } = createEnvironment();
    const created = await service.createFlow(createContext(), {
      companyId: "company-1",
      name: "Protected",
      triggerType: "manual",
    });
    await assert.rejects(
      () =>
        service.publishFlow(createContext({ hasPermission: (code) => code === "automation.view" }), created.id),
      PermissionDeniedError,
    );
  });

  it("soft deletes non-active flows", async () => {
    const { service } = createEnvironment();
    const created = await service.createFlow(createContext(), {
      companyId: "company-1",
      name: "Delete Me",
      triggerType: "schedule",
    });
    const deleted = await service.deleteFlow(createContext(), created.id);
    assert.ok(deleted.deleted_at);
    await assert.rejects(() => service.getFlow(createContext(), created.id), AutomationFlowNotFoundError);
  });

  it("blocks deletion of active flows", async () => {
    const { service } = createEnvironment();
    const created = await service.createFlow(createContext(), {
      companyId: "company-1",
      name: "Active Delete",
      triggerType: "manual",
    });
    await service.publishFlow(createContext(), created.id);
    await assert.rejects(() => service.deleteFlow(createContext(), created.id), AutomationFlowStateError);
  });

  it("lists flows scoped to company and filter", async () => {
    const { service } = createEnvironment();
    await service.createFlow(createContext(), {
      companyId: "company-1",
      name: "Alpha",
      triggerType: "manual",
    });
    const beta = await service.createFlow(createContext(), {
      companyId: "company-1",
      name: "Beta",
      triggerType: "webhook",
    });
    await service.publishFlow(createContext(), beta.id);

    const drafts = await service.listFlows(createContext(), { companyId: "company-1", status: "draft" });
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]?.name, "Alpha");
  });
});
