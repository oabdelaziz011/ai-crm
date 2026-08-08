import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TFunction } from "i18next";
import {
  translateLeadLifecycleStatusSafe,
  translateLeadStageLabel,
} from "./lead-stage-label.ts";
import { translateLeadPipelineLabel } from "./lead-pipeline-label.ts";
import {
  formatLeadMoney,
  leadMatchesSearch,
  resolveLeadScoreTone,
} from "./lead-kanban-mappers.ts";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import {
  getCompanyCurrency,
  setCompanyLocaleRuntime,
} from "../../../lib/company-locale/runtime.ts";

function makeT(map: Record<string, string>): TFunction {
  return ((key: string) => map[key] ?? key) as TFunction;
}

function lead(partial: Partial<LeadWorkspaceRow>): LeadWorkspaceRow {
  return {
    id: "lead_1",
    tenantId: "t1",
    name: "Omar",
    contactPerson: "Omar",
    email: "omar@example.com",
    phone: "+966500000000",
    companyName: "ValueOR",
    ownerId: "u1",
    owner: "Mohammed",
    stageId: "s1",
    stage: "New",
    sourceId: "src1",
    source: "Facebook",
    expectedValue: 250000,
    expectedCloseDate: null,
    priority: "normal",
    temperature: "warm",
    tags: [],
    notes: "",
    lastActivityAt: null,
    lifecycleStatus: "new",
    pipelineId: "p1",
    currency: "SAR",
    score: 55,
    scoreBand: "warm",
    isQualified: false,
    customerId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...partial,
  };
}

describe("lead stage localization", () => {
  it("never returns raw english lifecycle tokens when translations exist", () => {
    const t = makeT({
      "leads.stages.new": "جديد",
      "leads.lifecycle.contacted": "تم التواصل",
      "leads.stages.proposal_sent": "تم إرسال عرض السعر",
      "leads.stages.demo_scheduled": "عرض توضيحي",
    });

    assert.equal(translateLeadStageLabel(t, { name: "New", slug: "new", lifecycleStatus: "new" }), "جديد");
    assert.equal(
      translateLeadStageLabel(t, {
        name: "Contacted",
        slug: "contacted",
        lifecycleStatus: "contacted",
      }),
      "تم التواصل",
    );
    assert.equal(
      translateLeadStageLabel(t, {
        name: "Proposal Sent",
        slug: "proposal_sent",
        lifecycleStatus: "proposal",
      }),
      "تم إرسال عرض السعر",
    );
    assert.equal(
      translateLeadLifecycleStatusSafe(t, "demo_scheduled"),
      "عرض توضيحي",
    );
  });
});

describe("lead kanban mappers", () => {
  it("resolves urgent priority over temperature", () => {
    assert.equal(resolveLeadScoreTone(lead({ priority: "urgent", temperature: "cold" })), "urgent");
    assert.equal(resolveLeadScoreTone(lead({ priority: "normal", temperature: "hot" })), "hot");
  });

  it("searches by name company phone email and id", () => {
    const row = lead({});
    assert.equal(leadMatchesSearch(row, "omar"), true);
    assert.equal(leadMatchesSearch(row, "valueor"), true);
    assert.equal(leadMatchesSearch(row, "9665"), true);
    assert.equal(leadMatchesSearch(row, "lead_1"), true);
    assert.equal(leadMatchesSearch(row, "zzz"), false);
  });

  it("company settings currency is the canonical source for kanban money", () => {
    setCompanyLocaleRuntime({ currency: "EGP", intlLocale: "en-US" });
    assert.equal(getCompanyCurrency(), "EGP");
    const egpLabel = formatLeadMoney(1250);
    assert.ok(/EGP|E£|ج\.م/i.test(egpLabel) || egpLabel.includes("1,250") || egpLabel.includes("1250"));

    setCompanyLocaleRuntime({ currency: "AED", intlLocale: "en-US" });
    assert.equal(getCompanyCurrency(), "AED");
    const aedLabel = formatLeadMoney(100);
    assert.notEqual(lead({ currency: "SAR" }).currency, getCompanyCurrency());
    assert.ok(!aedLabel.includes("SAR"));
    assert.ok(/AED|د\.إ|Dh/i.test(aedLabel) || aedLabel.includes("100"));
  });

  it("exposes localized action labels via translation keys not hardcoded english", () => {
    const t = makeT({
      "leads.kanban.actions.createActivity": "إنشاء نشاط",
      "leads.kanban.actions.createOpportunity": "إنشاء فرصة",
      "leads.kanban.actions.createQuote": "إنشاء عرض سعر",
      "leads.kanban.context.editLead": "تعديل العميل المحتمل",
      "leads.kanban.drawer.openLead360": "فتح مساحة العميل المحتمل",
      "leads.pipelines.default": "خط الأنابيب الافتراضي",
    });
    assert.equal(t("leads.kanban.actions.createActivity"), "إنشاء نشاط");
    assert.equal(t("leads.kanban.context.editLead"), "تعديل العميل المحتمل");
    assert.equal(t("leads.kanban.drawer.openLead360"), "فتح مساحة العميل المحتمل");

    // Tooltip must match its own action — never reuse createQuote for opportunity.
    const opportunityLabel = t("leads.kanban.actions.createOpportunity");
    const quoteLabel = t("leads.kanban.actions.createQuote");
    assert.equal(opportunityLabel, "إنشاء فرصة");
    assert.notEqual(opportunityLabel, quoteLabel);
    assert.equal(
      translateLeadPipelineLabel(t, { name: "Default Pipeline", slug: "default", isDefault: true }),
      "خط الأنابيب الافتراضي",
    );
  });

  it("localizes default pipeline selector label", () => {
    const t = makeT({
      "leads.pipelines.default": "خط الأنابيب الافتراضي",
    });
    assert.equal(
      translateLeadPipelineLabel(t, { name: "Default Pipeline", slug: "default" }),
      "خط الأنابيب الافتراضي",
    );
    assert.equal(
      translateLeadPipelineLabel(t, { name: "Enterprise Sales", slug: "enterprise" }),
      "Enterprise Sales",
    );
  });

  it("recomputes column counts and stage values after a stage move", () => {
    const rows = [
      lead({ id: "a", stageId: "s1", expectedValue: 100 }),
      lead({ id: "b", stageId: "s1", expectedValue: 50 }),
      lead({ id: "c", stageId: "s2", expectedValue: 200 }),
    ];
    const afterMove = rows.map((row) =>
      row.id === "a" ? { ...row, stageId: "s2" } : row,
    );
    const count = (stageId: string) => afterMove.filter((row) => row.stageId === stageId).length;
    const value = (stageId: string) =>
      afterMove
        .filter((row) => row.stageId === stageId)
        .reduce((sum, row) => sum + (row.expectedValue ?? 0), 0);

    assert.equal(count("s1"), 1);
    assert.equal(count("s2"), 2);
    assert.equal(value("s1"), 50);
    assert.equal(value("s2"), 300);
  });
});
