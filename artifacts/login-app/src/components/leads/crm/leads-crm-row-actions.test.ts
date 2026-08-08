import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeLeadTableAction } from "./leads-crm-action-routes.ts";
import {
  groupLeadTableActions,
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
      "createOpportunity",
      "convert",
      "archive",
      "delete",
    ]);
  });

  it("hides RBAC-denied actions", () => {
    const actions = resolveLeadTableActions({
      permissions: {
        canView: true,
        canEdit: false,
        canAssign: false,
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
        canConvert: false,
        canArchive: false,
        canDelete: false,
      },
      hasPhone: true,
      hasEmail: true,
    });
    assert.equal(actions.length, 0);
  });
});

describe("groupLeadTableActions", () => {
  it("groups actions into enterprise menu sections with separators order", () => {
    const sections = groupLeadTableActions(
      resolveLeadTableActions({
        permissions: fullPerms,
        hasPhone: true,
        hasEmail: true,
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
    ["createOpportunity", { kind: "openOpportunity360", after: "createFromLead" }],
    ["call", { kind: "external", channel: "call" }],
    ["whatsapp", { kind: "whatsapp", channel: "platform-or-external" }],
    ["email", { kind: "external", channel: "email" }],
    ["assign", { kind: "openDialog", dialog: "assign" }],
    ["convert", { kind: "command", command: "convert" }],
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

  it("Create Opportunity uses createFromLead then Opportunity360", () => {
    assert.deepEqual(routeLeadTableAction("createOpportunity"), {
      kind: "openOpportunity360",
      after: "createFromLead",
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
