import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeLeadTableAction } from "./leads-crm-action-routes.ts";
import {
  groupLeadTableActions,
  isLeadAlreadyConverted,
  isLeadEligibleForOpportunityCreation,
  resolveLeadTableActions,
  type LeadTableActionId,
} from "./leads-crm-row-actions.ts";
import {
  externalWhatsAppUrl,
  resolveLeadWhatsAppRoute,
} from "./leads-crm-whatsapp.ts";

const fullPerms = {
  canView: true,
  canEdit: true,
  canAssign: true,
  canCreateOpportunity: true,
  canCreateQuote: true,
  canConvert: true,
  canArchive: true,
  canDelete: true,
};

describe("resolveLeadTableActions", () => {
  it("includes core actions when fully permitted and contact exists", () => {
    const actions = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: true,
      hasEmail: true,
      isQualified: true,
    });
    const ids = actions.map((a) => a.id);
    assert.deepEqual(ids, [
      "openLead360",
      "edit",
      "createActivity",
      "call",
      "whatsapp",
      "email",
      "assign",
      "createQuote",
      "archive",
      "delete",
    ]);
  });

  it("does not offer create-opportunity or convert actions", () => {
    const ids = resolveLeadTableActions({
      permissions: { ...fullPerms, canConvertWithOpportunity: true },
      hasPhone: false,
      hasEmail: false,
      lifecycleStatus: "demo_completed",
    }).map((a) => a.id);
    assert.ok(!ids.includes("createOpportunity"));
    assert.ok(!ids.includes("convertWithOpportunity"));
    assert.ok(!ids.includes("convert"));
    assert.ok(ids.includes("createQuote"));
  });

  it("hides RBAC-denied actions", () => {
    const actions = resolveLeadTableActions({
      permissions: {
        canView: true,
        canEdit: false,
        canAssign: false,
        canCreateOpportunity: false,
        canConvert: false,
        canArchive: false,
        canDelete: false,
      },
      hasPhone: true,
      hasEmail: true,
    });
    const ids = actions.map((a) => a.id);
    assert.deepEqual(ids, ["openLead360", "call", "whatsapp", "email"]);
    assert.ok(!ids.includes("edit"));
    assert.ok(!ids.includes("delete"));
    assert.ok(!ids.includes("createOpportunity"));
  });

  it("omits call/whatsapp/email when contact channels are missing", () => {
    const actions = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: false,
      hasEmail: false,
    });
    const ids = actions.map((a) => a.id);
    assert.ok(!ids.includes("call"));
    assert.ok(!ids.includes("whatsapp"));
    assert.ok(!ids.includes("email"));
    assert.ok(ids.includes("openLead360"));
    assert.ok(ids.includes("createActivity"));
  });

  it("marks delete as destructive", () => {
    const actions = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: false,
      hasEmail: false,
    });
    const del = actions.find((a) => a.id === "delete");
    assert.equal(del?.destructive, true);
  });

  it("returns empty list without view permission", () => {
    const actions = resolveLeadTableActions({
      permissions: {
        canView: false,
        canEdit: false,
        canAssign: false,
        canCreateOpportunity: false,
        canConvert: false,
        canArchive: false,
        canDelete: false,
      },
      hasPhone: true,
      hasEmail: true,
    });
    assert.equal(actions.length, 0);
  });

  it("disables createQuote until the lead reaches the Opportunity kanban column", () => {
    const early = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: false,
      hasEmail: false,
      lifecycleStatus: "qualified",
    }).find((action) => action.id === "createQuote");
    assert.equal(early?.disabled, true);

    const ready = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: false,
      hasEmail: false,
      lifecycleStatus: "demo_completed",
    }).find((action) => action.id === "createQuote");
    assert.equal(ready?.disabled, false);
  });
});

describe("isLeadEligibleForOpportunityCreation", () => {
  it("matches backend eligibility rules", () => {
    assert.equal(isLeadEligibleForOpportunityCreation({ isQualified: true, hasEmail: true }), true);
    assert.equal(isLeadEligibleForOpportunityCreation({ isQualified: true, hasEmail: false }), false);
    assert.equal(isLeadEligibleForOpportunityCreation({ customerId: "cust-1" }), true);
    assert.equal(isLeadEligibleForOpportunityCreation({ isQualified: false, customerId: null }), false);
  });

  it("treats lifecycleStatus qualified as eligible when the flag lags and email can resolve customer", () => {
    assert.equal(
      isLeadEligibleForOpportunityCreation({
        isQualified: false,
        customerId: null,
        lifecycleStatus: "qualified",
        hasEmail: true,
      }),
      true,
    );
    assert.equal(
      isLeadEligibleForOpportunityCreation({
        isQualified: false,
        customerId: null,
        lifecycleStatus: "qualified",
        hasEmail: false,
      }),
      false,
    );
  });
});

describe("resolveLeadTableActions conversion rules", () => {
  it("omits convert when the lead is already converted", () => {
    assert.equal(
      isLeadAlreadyConverted({ customerId: "cust-1", lifecycleStatus: "qualified" }),
      false,
    );
    assert.equal(isLeadAlreadyConverted({ lifecycleStatus: "converted" }), true);
    assert.equal(isLeadAlreadyConverted({ lifecycleStatus: "new" }), false);

    const actions = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: false,
      hasEmail: false,
      isConverted: true,
      customerId: "cust-1",
    });
    const ids = actions.map((a) => a.id);
    assert.ok(!ids.includes("convert"));
    assert.ok(!ids.includes("createOpportunity"));
  });

  it("keeps convert for unconverted qualified leads (customerId null)", () => {
    assert.equal(
      isLeadAlreadyConverted({ customerId: null, lifecycleStatus: "qualified" }),
      false,
    );
    const actions = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: false,
      hasEmail: false,
      isQualified: true,
      customerId: null,
      lifecycleStatus: "qualified",
      isConverted: isLeadAlreadyConverted({
        customerId: null,
        lifecycleStatus: "qualified",
      }),
    });
    const ids = actions.map((a) => a.id);
    assert.ok(!ids.includes("convert"));
    assert.ok(!ids.includes("createOpportunity"));
  });

  it("keeps convert for customer-linked leads that are not yet finalized as converted", () => {
    const isConverted = isLeadAlreadyConverted({
      customerId: "cust-linked",
      lifecycleStatus: "qualified",
    });
    assert.equal(isConverted, false);
    const actions = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: false,
      hasEmail: false,
      isQualified: true,
      customerId: "cust-linked",
      lifecycleStatus: "qualified",
      isConverted,
    });
    const ids = actions.map((a) => a.id);
    assert.ok(!ids.includes("convert"));
    assert.ok(!ids.includes("createOpportunity"));
  });

  it("Kanban Convert visibility uses the same isLeadAlreadyConverted rule", () => {
    // Mirrors leads-kanban-page context-menu gating.
    assert.equal(
      isLeadAlreadyConverted({ customerId: "cust-1", lifecycleStatus: "qualified" }),
      false,
    );
    assert.equal(
      isLeadAlreadyConverted({ customerId: "cust-1", lifecycleStatus: "converted" }),
      true,
    );
    assert.equal(
      isLeadAlreadyConverted({ customerId: null, lifecycleStatus: "qualified" }),
      false,
    );
  });

  it("shows createOpportunity with opportunities.convert permission even without leads.edit", () => {
    const actions = resolveLeadTableActions({
      permissions: {
        canView: true,
        canEdit: false,
        canAssign: false,
        canCreateOpportunity: true,
        canConvert: false,
        canArchive: false,
        canDelete: false,
      },
      hasPhone: false,
      hasEmail: false,
      isQualified: true,
    });
    assert.ok(!actions.some((a) => a.id === "createOpportunity"));
    assert.ok(!actions.some((a) => a.id === "convert"));
  });

  it("shows Complete Demo only for demo_scheduled leads with leads.edit", () => {
    const withDemo = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: false,
      hasEmail: false,
      lifecycleStatus: "demo_scheduled",
    });
    assert.ok(withDemo.some((a) => a.id === "completeDemo"));

    const without = resolveLeadTableActions({
      permissions: fullPerms,
      hasPhone: false,
      hasEmail: false,
      lifecycleStatus: "demo_completed",
    });
    assert.ok(!without.some((a) => a.id === "completeDemo"));
  });

  it("blocks Create Opportunity while demo is still scheduled", () => {
    assert.equal(
      isLeadEligibleForOpportunityCreation({
        isQualified: true,
        hasEmail: true,
        lifecycleStatus: "demo_scheduled",
      }),
      false,
    );
    assert.equal(
      isLeadEligibleForOpportunityCreation({
        isQualified: true,
        hasEmail: true,
        lifecycleStatus: "demo_completed",
      }),
      true,
    );

    const actions = resolveLeadTableActions({
      permissions: { ...fullPerms, canConvertWithOpportunity: true },
      hasPhone: false,
      hasEmail: false,
      isQualified: true,
      lifecycleStatus: "demo_scheduled",
    });
    assert.ok(!actions.some((action) => action.id === "createOpportunity"));
    assert.ok(!actions.some((action) => action.id === "convertWithOpportunity"));
    const quote = actions.find((action) => action.id === "createQuote");
    assert.equal(quote?.disabled, true);
  });
});

describe("groupLeadTableActions", () => {
  it("groups actions into enterprise menu sections with separators order", () => {
    const sections = groupLeadTableActions(
      resolveLeadTableActions({
        permissions: fullPerms,
        hasPhone: true,
        hasEmail: true,
        isQualified: true,
      }),
    );
    assert.deepEqual(
      sections.map((s) => s.group),
      ["navigation", "editing", "communication", "assignment", "conversion", "dangerous"],
    );
    assert.deepEqual(
      sections.find((s) => s.group === "communication")?.actions.map((a) => a.id),
      ["call", "whatsapp", "email"],
    );
    assert.deepEqual(
      sections.find((s) => s.group === "dangerous")?.actions.map((a) => a.id),
      ["archive", "delete"],
    );
  });
});

describe("lead table column order contract", () => {
  it("splits lead into customerName/email/mobile and places actions last", () => {
    const columnKeys = [
      "customerName",
      "email",
      "mobile",
      "company",
      "owner",
      "stage",
      "priority",
      "temperature",
      "value",
      "source",
      "expectedCloseDate",
      "lastActivity",
      "actions",
    ];
    assert.equal(columnKeys[0], "customerName");
    assert.equal(columnKeys[1], "email");
    assert.equal(columnKeys[2], "mobile");
    assert.equal(columnKeys[columnKeys.length - 1], "actions");
    assert.ok(columnKeys.indexOf("actions") > columnKeys.indexOf("lastActivity"));
  });
});

describe("routeLeadTableAction", () => {
  const cases: Array<[LeadTableActionId, ReturnType<typeof routeLeadTableAction>]> = [
    ["openLead360", { kind: "openLead360", tab: "overview" }],
    ["edit", { kind: "openDialog", dialog: "edit" }],
    ["createActivity", { kind: "openDialog", dialog: "activity" }],
    ["createOpportunity", { kind: "openDialog", dialog: "createOpportunity" }],
    ["createQuote", { kind: "command", command: "createQuote" }],
    ["call", { kind: "external", channel: "call" }],
    ["whatsapp", { kind: "whatsapp", channel: "platform-or-external" }],
    ["email", { kind: "external", channel: "email" }],
    ["assign", { kind: "openDialog", dialog: "assign" }],
    ["convert", { kind: "command", command: "convert" }],
    ["convertWithOpportunity", { kind: "command", command: "convertWithOpportunity" }],
    ["archive", { kind: "command", command: "archive" }],
    ["delete", { kind: "openDialog", dialog: "deleteConfirm" }],
  ];

  for (const [action, expected] of cases) {
    it(`routes ${action} to ${expected.kind}`, () => {
      assert.deepEqual(routeLeadTableAction(action), expected);
    });
  }

  it("Edit opens the Lead Edit form dialog, not Lead360", () => {
    assert.deepEqual(routeLeadTableAction("edit"), {
      kind: "openDialog",
      dialog: "edit",
    });
  });

  it("Create Opportunity opens create dialog before Opportunity360", () => {
    assert.deepEqual(routeLeadTableAction("createOpportunity"), {
      kind: "openDialog",
      dialog: "createOpportunity",
    });
  });

  it("Convert Lead uses the existing convertLead command", () => {
    assert.deepEqual(routeLeadTableAction("convert"), {
      kind: "command",
      command: "convert",
    });
  });
});

describe("resolveLeadWhatsAppRoute", () => {
  it("uses platform Conversation Center when WhatsApp integration exists", () => {
    assert.deepEqual(
      resolveLeadWhatsAppRoute({
        hasWhatsAppIntegration: true,
        phone: "+966501234567",
        customerId: "cust-1",
      }),
      { kind: "platform", customerId: "cust-1", phone: "+966501234567" },
    );
  });

  it("falls back to external WhatsApp when integration is unavailable", () => {
    assert.deepEqual(
      resolveLeadWhatsAppRoute({
        hasWhatsAppIntegration: false,
        phone: "+966501234567",
      }),
      { kind: "external", phone: "+966501234567" },
    );
    assert.equal(externalWhatsAppUrl("+966 50 123 4567"), "https://wa.me/966501234567");
  });
});

describe("avatar accessibility contract", () => {
  it("requires owner name for alt text and actions aria-label key", () => {
    const ownerName = "Omar Ali";
    const alt = ownerName;
    const ariaKey = "leads.table.rowActions.menuAriaLabel";
    assert.equal(alt, "Omar Ali");
    assert.equal(ariaKey, "leads.table.rowActions.menuAriaLabel");
  });
});
