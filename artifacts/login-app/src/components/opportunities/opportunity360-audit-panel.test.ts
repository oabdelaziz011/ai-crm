import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OpportunityHistoryReadModel, OpportunityStageReadModel } from "@workspace/application-layer";
import { setCompanyLocaleRuntime } from "@/lib/company-locale/runtime";
import { OPPORTUNITY360_TABS } from "./opportunity360-tabs";
import {
  formatOpportunityAuditAction,
  formatOpportunityAuditValue,
  isUuidValue,
  opportunityHistoryHasFieldDiff,
  translateOpportunityAuditFieldName,
} from "./opportunity360-audit-utils";

const arT = (key: string, options?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    "opportunities360.audit.events.stage_changed": "تم تغيير المرحلة",
    "opportunities360.audit.events.opportunity_created": "تم إنشاء الفرصة",
    "opportunities360.audit.events.unknown": "تم تحديث السجل",
    "opportunities360.audit.fields.stage_id": "المرحلة",
    "opportunities360.audit.fields.probability_percent": "الاحتمالية",
    "opportunities360.audit.fields.owner_id": "المسؤول",
    "opportunities360.audit.fields.amount": "القيمة",
    "opportunities360.audit.fields.unknown": "حقل",
    "opportunities360.audit.valuePercent": "{{value}}%",
    "opportunities360.emptyValue": "—",
  };
  const template = map[key] ?? key;
  if (options && "value" in options) {
    return template.replace("{{value}}", String(options.value));
  }
  return template;
};

const STAGE_QUAL_ID = "d7ec1111-1111-4111-8111-111111111111";
const STAGE_DISC_ID = "7be22222-2222-4222-8222-222222222222";

const stageById = new Map<string, OpportunityStageReadModel>([
  [
    STAGE_QUAL_ID,
    {
      id: STAGE_QUAL_ID,
      pipelineId: "pipe-1",
      name: "التأهيل",
      slug: "qualification",
      stageKey: "qualification",
      sortOrder: 0,
      defaultProbabilityPercent: 10,
      isTerminal: false,
    },
  ],
  [
    STAGE_DISC_ID,
    {
      id: STAGE_DISC_ID,
      pipelineId: "pipe-1",
      name: "الاستكشاف",
      slug: "discovery",
      stageKey: "discovery",
      sortOrder: 1,
      defaultProbabilityPercent: 20,
      isTerminal: false,
    },
  ],
]);

describe("OPPORTUNITY360_TABS", () => {
  it("excludes Timeline and keeps Audit as history source", () => {
    assert.deepEqual([...OPPORTUNITY360_TABS], ["overview", "products", "quotes", "audit"]);
    assert.ok(!OPPORTUNITY360_TABS.includes("timeline" as never));
  });
});

describe("opportunityHistoryHasFieldDiff", () => {
  it("detects field-level audit rows", () => {
    const item: OpportunityHistoryReadModel = {
      id: "h1",
      opportunityId: "o1",
      eventType: "stage_changed",
      fieldName: "stage_id",
      previousValue: STAGE_QUAL_ID,
      newValue: STAGE_DISC_ID,
      summary: "Stage changed",
      actorUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    assert.equal(opportunityHistoryHasFieldDiff(item), true);
  });

  it("returns false for summary-only rows", () => {
    const item: OpportunityHistoryReadModel = {
      id: "h2",
      opportunityId: "o1",
      eventType: "opportunity_created",
      fieldName: null,
      previousValue: null,
      newValue: null,
      summary: "Opportunity created",
      actorUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    assert.equal(opportunityHistoryHasFieldDiff(item), false);
  });
});

describe("formatOpportunityAuditAction", () => {
  it("uses localized event label instead of English summary", () => {
    const label = formatOpportunityAuditAction(
      {
        id: "h1",
        opportunityId: "o1",
        eventType: "stage_changed",
        fieldName: null,
        previousValue: null,
        newValue: null,
        summary: "Moved to Proposal",
        actorUserId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      arT,
    );
    assert.equal(label, "تم تغيير المرحلة");
  });

  it("never returns raw snake_case event types", () => {
    const label = formatOpportunityAuditAction(
      {
        id: "h1",
        opportunityId: "o1",
        eventType: "custom_backend_event",
        fieldName: null,
        previousValue: null,
        newValue: null,
        summary: "Backend summary",
        actorUserId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      arT,
    );
    assert.equal(label, "تم تحديث السجل");
    assert.doesNotMatch(label, /custom_backend_event|_/);
  });
});

describe("translateOpportunityAuditFieldName", () => {
  it("maps backend field names to Arabic labels", () => {
    assert.equal(translateOpportunityAuditFieldName("stage_id", arT), "المرحلة");
    assert.equal(translateOpportunityAuditFieldName("probability_percent", arT), "الاحتمالية");
    assert.equal(translateOpportunityAuditFieldName("owner_user_id", arT), "المسؤول");
  });

  it("never returns snake_case field names", () => {
    const label = translateOpportunityAuditFieldName("stage_id", arT);
    assert.doesNotMatch(label, /stage_id|_/);
  });
});

describe("formatOpportunityAuditValue", () => {
  it("renders stage UUIDs using pipeline stage names from the board", () => {
    setCompanyLocaleRuntime({ intlLocale: "ar-SA", currency: "EGP", timezone: "UTC" });
    const ctx = { t: arT, stageById, opportunityCurrency: "EGP" };
    assert.equal(
      formatOpportunityAuditValue("stage_id", STAGE_QUAL_ID, ctx),
      "التأهيل",
    );
    assert.equal(
      formatOpportunityAuditValue("stage_id", STAGE_DISC_ID, ctx),
      "الاستكشاف",
    );
  });

  it("formats probability as localized percent", () => {
    assert.equal(
      formatOpportunityAuditValue("probability_percent", "25", { t: arT, stageById }),
      "25%",
    );
  });

  it("hides bare UUIDs for unknown references", () => {
    assert.equal(
      formatOpportunityAuditValue("pipeline_id", STAGE_QUAL_ID, { t: arT, stageById }),
      "—",
    );
  });
});

describe("isUuidValue", () => {
  it("detects UUID-shaped values", () => {
    assert.equal(isUuidValue(STAGE_QUAL_ID), true);
    assert.equal(isUuidValue("Qualification"), false);
  });
});
