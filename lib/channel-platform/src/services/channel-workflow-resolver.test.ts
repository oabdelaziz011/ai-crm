import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChannelWorkflowBindingRecord, ChannelWorkflowBindingRepository } from "../repositories/channel-workflow-binding-repository.js";
import { ChannelWorkflowResolver } from "../services/channel-workflow-resolver.js";

function createBinding(overrides?: Partial<ChannelWorkflowBindingRecord>): ChannelWorkflowBindingRecord {
  return {
    id: "binding-1",
    company_id: "company-1",
    company_channel_id: "channel-1",
    automation_flow_id: "flow-1",
    is_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

function createResolver(options?: {
  binding?: ChannelWorkflowBindingRecord | null;
  executable?: boolean;
}) {
  const bindings: ChannelWorkflowBindingRepository = {
    async findByCompanyChannelId(companyChannelId) {
      if (!options?.binding || options.binding.company_channel_id !== companyChannelId) {
        return null;
      }
      return options.binding;
    },
  };

  return new ChannelWorkflowResolver({
    bindings,
    flowValidator: {
      async isExecutableFlow() {
        return options?.executable ?? true;
      },
    },
  });
}

describe("ChannelWorkflowResolver", () => {
  it("returns workflow when binding exists and flow is executable", async () => {
    const resolver = createResolver({ binding: createBinding() });
    const resolved = await resolver.resolve("channel-1");

    assert.deepEqual(resolved, {
      companyId: "company-1",
      companyChannelId: "channel-1",
      automationFlowId: "flow-1",
    });
  });

  it("returns null when no binding exists", async () => {
    const resolver = createResolver({ binding: null });
    const resolved = await resolver.resolve("channel-1");
    assert.equal(resolved, null);
  });

  it("returns null when binding is disabled", async () => {
    const resolver = createResolver({ binding: createBinding({ is_enabled: false }) });
    const resolved = await resolver.resolve("channel-1");
    assert.equal(resolved, null);
  });

  it("returns null when bound workflow is invalid or not executable", async () => {
    const resolver = createResolver({ binding: createBinding(), executable: false });
    const resolved = await resolver.resolve("channel-1");
    assert.equal(resolved, null);
  });
});
