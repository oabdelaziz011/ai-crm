import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmailRoutingEngine,
  type EmailRoutingTargetResolver,
} from "@workspace/ai-intent-engine";
import {
  createSupabaseEmailRoutingTargetResolver,
  resolveEmailRoutingTargetFromConfig,
} from "./email-routing-target-resolver-adapter.js";

describe("resolveEmailRoutingTargetFromConfig (Sprint 7)", () => {
  it("resolves configured Sales department target", () => {
    const resolved = resolveEmailRoutingTargetFromConfig({
      category: "sales",
      rows: [
        {
          category: "sales",
          enabled: true,
          target_type: "department",
          target_id: "dept-sales",
        },
      ],
    });
    assert.deepEqual(resolved, {
      targetType: "department",
      targetId: "dept-sales",
    });
  });

  it("resolves configured Support employee target", () => {
    const resolved = resolveEmailRoutingTargetFromConfig({
      category: "support",
      rows: [
        {
          category: "support",
          enabled: true,
          target_type: "employee",
          target_id: "user-1",
        },
      ],
    });
    assert.deepEqual(resolved, {
      targetType: "employee",
      targetId: "user-1",
    });
  });

  it("returns null for unconfigured category", () => {
    const resolved = resolveEmailRoutingTargetFromConfig({
      category: "billing",
      rows: [
        {
          category: "sales",
          enabled: true,
          target_type: "department",
          target_id: "dept-sales",
        },
      ],
    });
    assert.equal(resolved, null);
  });

  it("returns null for disabled category", () => {
    const resolved = resolveEmailRoutingTargetFromConfig({
      category: "hr",
      rows: [
        {
          category: "hr",
          enabled: false,
          target_type: "queue",
          target_id: "queue-1",
        },
      ],
    });
    assert.equal(resolved, null);
  });

  it("returns null when target_id is cleared", () => {
    const resolved = resolveEmailRoutingTargetFromConfig({
      category: "complaint",
      rows: [
        {
          category: "complaint",
          enabled: true,
          target_type: "queue",
          target_id: null,
        },
      ],
    });
    assert.equal(resolved, null);
  });

  it("rejects unsupported team target type", () => {
    const resolved = resolveEmailRoutingTargetFromConfig({
      category: "sales",
      rows: [
        {
          category: "sales",
          enabled: true,
          target_type: "team",
          target_id: "team-1",
        },
      ],
    });
    assert.equal(resolved, null);
  });
});

describe("createEmailRoutingEngine + Sprint 7 resolver", () => {
  it("routes Sales to configured department via resolver", async () => {
    const resolver: EmailRoutingTargetResolver = {
      resolveTarget({ category }) {
        return resolveEmailRoutingTargetFromConfig({
          category,
          rows: [
            {
              category: "sales",
              enabled: true,
              target_type: "department",
              target_id: "dept-1",
            },
            {
              category: "support",
              enabled: true,
              target_type: "employee",
              target_id: "emp-1",
            },
          ],
        });
      },
    };
    const decision = await createEmailRoutingEngine({ targetResolver: resolver }).route({
      companyId: "co-1",
      classification: {
        category: "sales",
        confidence: 0.91,
        reason: "demo",
        source: "llm",
        subcategory: null,
      },
    });
    assert.equal(decision.targetType, "department");
    assert.equal(decision.targetId, "dept-1");
    assert.equal(decision.configurationRequired, false);
  });

  it("routes Support to configured employee via resolver", async () => {
    const resolver: EmailRoutingTargetResolver = {
      resolveTarget({ category }) {
        return resolveEmailRoutingTargetFromConfig({
          category,
          rows: [
            {
              category: "support",
              enabled: true,
              target_type: "employee",
              target_id: "emp-support",
            },
          ],
        });
      },
    };
    const decision = await createEmailRoutingEngine({ targetResolver: resolver }).route({
      companyId: "co-1",
      classification: {
        category: "support",
        confidence: 0.88,
        reason: "help",
        source: "llm",
        subcategory: null,
      },
    });
    assert.equal(decision.targetType, "employee");
    assert.equal(decision.targetId, "emp-support");
  });

  it("keeps unconfigured category unresolved", async () => {
    const decision = await createEmailRoutingEngine({
      targetResolver: {
        resolveTarget() {
          return null;
        },
      },
    }).route({
      companyId: "co-1",
      classification: {
        category: "billing",
        confidence: 0.9,
        reason: "invoice",
        source: "llm",
        subcategory: null,
      },
    });
    assert.equal(decision.targetType, "unresolved");
    assert.equal(decision.configurationRequired, true);
  });
});

describe("createSupabaseEmailRoutingTargetResolver", () => {
  it("loads only the requested company category row", async () => {
    const calls: Array<{ table: string; filters: Record<string, string> }> = [];
    const client = {
      from(table: string) {
        const filters: Record<string, string> = {};
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string) {
            filters[column] = value;
            return builder;
          },
          async maybeSingle() {
            calls.push({ table, filters });
            if (filters.company_id !== "co-a" || filters.category !== "sales") {
              return { data: null, error: null };
            }
            return {
              data: {
                category: "sales",
                enabled: true,
                target_type: "department",
                target_id: "dept-a",
              },
              error: null,
            };
          },
        };
        return builder;
      },
    };

    const resolver = createSupabaseEmailRoutingTargetResolver(client as never);
    const hit = await resolver.resolveTarget({ companyId: "co-a", category: "sales" });
    const miss = await resolver.resolveTarget({ companyId: "co-b", category: "sales" });

    assert.deepEqual(hit, { targetType: "department", targetId: "dept-a" });
    assert.equal(miss, null);
    assert.equal(calls[0]?.filters.company_id, "co-a");
    assert.equal(calls[1]?.filters.company_id, "co-b");
  });
});
