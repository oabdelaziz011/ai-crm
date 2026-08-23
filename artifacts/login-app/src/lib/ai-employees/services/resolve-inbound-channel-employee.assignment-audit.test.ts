/**
 * Phase 5M — AUDIT ONLY.
 * Mirrors inbound employee selection rules from resolve-inbound-channel-employee.ts
 * without modifying production behavior. Keep in sync with that file's scoring/fallback.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateCommercialToolAccess,
} from "../utilities/ai-employee-commercial-runtime-gate.js";
import { evaluateToolScope } from "../utilities/tool-scope-filter.js";

type FakeEmployee = {
  id: string;
  displayName: string;
  status: "published" | "draft" | "archived";
  tags: string[];
  allowedToolKeys: string[];
  updatedAt: string;
  companyId: string;
};

function scoreEmployeeForChannel(
  employee: FakeEmployee,
  channelKey: string,
  companyChannelId: string,
): number {
  const tags = employee.tags ?? [];
  const channelTag = `channel:${channelKey}`;
  const channelIdTag = `channel:${companyChannelId}`;
  let score = 0;
  if (tags.includes(channelIdTag)) score += 100;
  if (tags.includes(channelTag)) score += 50;
  if (tags.includes("capability:omnichannel")) score += 10;
  return score;
}

/**
 * Mirrors resolveInboundChannelEmployee candidate selection + first ready binding win.
 * `isReady` stands in for resolveEmployeeChannelRuntime(...) truthiness.
 */
function selectInboundEmployee(input: {
  companyId: string;
  channelKey: string;
  companyChannelId: string;
  employees: FakeEmployee[];
  isReady: (employeeId: string) => boolean;
}): {
  selected: FakeEmployee | null;
  fallbackUsed: boolean;
  reason: string;
  candidateIds: string[];
} {
  const published = input.employees
    .filter((e) => e.companyId === input.companyId && e.status === "published")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (published.length === 0) {
    return { selected: null, fallbackUsed: false, reason: "no_published", candidateIds: [] };
  }

  const ranked = [...published].sort(
    (left, right) =>
      scoreEmployeeForChannel(right, input.channelKey, input.companyChannelId) -
      scoreEmployeeForChannel(left, input.channelKey, input.companyChannelId),
  );

  const tagged = ranked.filter(
    (employee) => scoreEmployeeForChannel(employee, input.channelKey, input.companyChannelId) > 0,
  );
  const fallbackUsed = tagged.length === 0;
  const candidates = fallbackUsed ? ranked : tagged;

  for (const employee of candidates) {
    if (input.isReady(employee.id)) {
      return {
        selected: employee,
        fallbackUsed,
        reason: fallbackUsed ? "fallback_first_ready_published" : "tag_ranked_first_ready",
        candidateIds: candidates.map((c) => c.id),
      };
    }
  }

  return {
    selected: null,
    fallbackUsed,
    reason: "no_ready_binding",
    candidateIds: candidates.map((c) => c.id),
  };
}

const CHANNEL = "whatsapp";
const CHANNEL_ID = "chan-wa-1";
const COMPANY = "company-a";

function emp(partial: Partial<FakeEmployee> & Pick<FakeEmployee, "id">): FakeEmployee {
  return {
    displayName: partial.id,
    status: "published",
    tags: [],
    allowedToolKeys: ["knowledge_search"],
    updatedAt: "2026-08-01T00:00:00.000Z",
    companyId: COMPANY,
    ...partial,
  };
}

describe("Phase 5M inbound AI Employee assignment audit", () => {
  it("1. one exact channel-id tag match wins", () => {
    const result = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [
        emp({ id: "untagged", tags: [], updatedAt: "2026-08-20T00:00:00.000Z" }),
        emp({ id: "exact", tags: [`channel:${CHANNEL_ID}`], updatedAt: "2026-07-01T00:00:00.000Z" }),
      ],
      isReady: () => true,
    });
    assert.equal(result.selected?.id, "exact");
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.reason, "tag_ranked_first_ready");
  });

  it("2. multiple tag matches — higher score then updated_at wins among equal scores", () => {
    const multi = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [
        emp({ id: "channel-only", tags: [`channel:${CHANNEL}`], updatedAt: "2026-08-20T00:00:00.000Z" }),
        emp({
          id: "channel-id",
          tags: [`channel:${CHANNEL_ID}`],
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
      ],
      isReady: () => true,
    });
    assert.equal(multi.selected?.id, "channel-id");
    assert.equal(multi.fallbackUsed, false);

    const tie = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [
        emp({ id: "older", tags: [`channel:${CHANNEL}`], updatedAt: "2026-07-01T00:00:00.000Z" }),
        emp({ id: "newer", tags: [`channel:${CHANNEL}`], updatedAt: "2026-08-20T00:00:00.000Z" }),
      ],
      isReady: () => true,
    });
    assert.equal(tie.selected?.id, "newer");
  });

  it("3/4. no tag match → fallback to published ready ranked list", () => {
    const result = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [
        emp({
          id: "sales",
          tags: [],
          allowedToolKeys: ["create_lead"],
          updatedAt: "2026-08-10T00:00:00.000Z",
        }),
        emp({
          id: "support",
          tags: [],
          allowedToolKeys: ["knowledge_search", "create_ticket"],
          updatedAt: "2026-08-20T00:00:00.000Z",
        }),
      ],
      isReady: () => true,
    });
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.selected?.id, "support");
    assert.equal(result.reason, "fallback_first_ready_published");
    assert.deepEqual(result.selected?.allowedToolKeys, ["knowledge_search", "create_ticket"]);
  });

  it("5. unpublished employee excluded", () => {
    const result = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [
        emp({ id: "draft", status: "draft", tags: [`channel:${CHANNEL_ID}`] }),
        emp({ id: "live", tags: [], updatedAt: "2026-08-01T00:00:00.000Z" }),
      ],
      isReady: () => true,
    });
    assert.equal(result.selected?.id, "live");
    assert.equal(result.fallbackUsed, true);
  });

  it("6. unready employee skipped; next candidate used", () => {
    const result = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [
        emp({ id: "tagged-unready", tags: [`channel:${CHANNEL_ID}`], updatedAt: "2026-08-20T00:00:00.000Z" }),
        emp({ id: "tagged-ready", tags: [`channel:${CHANNEL}`], updatedAt: "2026-08-01T00:00:00.000Z" }),
      ],
      isReady: (id) => id === "tagged-ready",
    });
    assert.equal(result.selected?.id, "tagged-ready");
    assert.equal(result.fallbackUsed, false);
  });

  it("7. cross-company employee cannot be selected", () => {
    const result = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [
        emp({
          id: "other-co",
          companyId: "company-b",
          tags: [`channel:${CHANNEL_ID}`],
          updatedAt: "2026-08-20T00:00:00.000Z",
        }),
        emp({ id: "ours", tags: [], updatedAt: "2026-08-01T00:00:00.000Z" }),
      ],
      isReady: () => true,
    });
    assert.equal(result.selected?.id, "ours");
    assert.notEqual(result.selected?.companyId, "company-b");
  });

  it("8. fallback can select employee with different allowed_tool_keys (product routing)", () => {
    const result = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [
        emp({
          id: "bookings-bot",
          tags: [],
          allowedToolKeys: ["create_booking", "search_availability"],
          updatedAt: "2026-08-20T00:00:00.000Z",
        }),
        emp({
          id: "knowledge-bot",
          tags: [`channel:instagram`],
          allowedToolKeys: ["knowledge_search"],
          updatedAt: "2026-08-19T00:00:00.000Z",
        }),
      ],
      isReady: () => true,
    });
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.selected?.id, "bookings-bot");
  });

  it("9/10. different allowed_tool_keys still cannot bypass commercial or assignment gates", async () => {
    const selectedKeys = ["create_booking", "knowledge_search"] as const;

    const assignedDenied = evaluateToolScope({
      toolKey: "create_ticket",
      allowedToolKeys: selectedKeys,
      employeeId: "employee-fallback",
    });
    assert.equal(assignedDenied.decision, "deny");

    const commercialDenied = await evaluateCommercialToolAccess({
      toolKey: "create_booking",
      companyId: COMPANY,
      isFeatureEnabled: async (_companyId, featureCode) => featureCode === "ai_employee",
    });
    assert.equal(commercialDenied.allowed, false);
    if (!commercialDenied.allowed) {
      assert.equal(commercialDenied.denialReason, "FEATURE_NOT_ENTITLED");
    }

    const commercialAllowed = await evaluateCommercialToolAccess({
      toolKey: "create_booking",
      companyId: COMPANY,
      isFeatureEnabled: async (_companyId, featureCode) =>
        featureCode === "ai_employee" || featureCode === "bookings",
    });
    assert.equal(commercialAllowed.allowed, true);

    const assignedOk = evaluateToolScope({
      toolKey: "create_booking",
      allowedToolKeys: selectedKeys,
      employeeId: "employee-fallback",
    });
    assert.equal(assignedOk.decision, "allow");
  });

  it("11. no eligible employee → null", () => {
    const nonePublished = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [emp({ id: "draft", status: "draft", tags: [`channel:${CHANNEL_ID}`] })],
      isReady: () => true,
    });
    assert.equal(nonePublished.selected, null);
    assert.equal(nonePublished.reason, "no_published");

    const noneReady = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees: [emp({ id: "live", tags: [`channel:${CHANNEL_ID}`] })],
      isReady: () => false,
    });
    assert.equal(noneReady.selected, null);
    assert.equal(noneReady.reason, "no_ready_binding");
  });

  it("12. selection is deterministic across repeated resolution for same inputs", () => {
    const employees = [
      emp({ id: "a", tags: [], updatedAt: "2026-08-10T00:00:00.000Z" }),
      emp({ id: "b", tags: [], updatedAt: "2026-08-20T00:00:00.000Z" }),
      emp({ id: "c", tags: [`channel:${CHANNEL}`], updatedAt: "2026-08-01T00:00:00.000Z" }),
    ];
    const first = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees,
      isReady: () => true,
    });
    const second = selectInboundEmployee({
      companyId: COMPANY,
      channelKey: CHANNEL,
      companyChannelId: CHANNEL_ID,
      employees,
      isReady: () => true,
    });
    assert.equal(first.selected?.id, second.selected?.id);
    assert.equal(first.selected?.id, "c");
    assert.equal(first.fallbackUsed, false);
  });
});
