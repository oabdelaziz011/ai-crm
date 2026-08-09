import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeLeadTableAction,
  executeLeadTableActionRoute,
  routeForLeadTableAction,
} from "./leads-crm-action-handler.ts";
import type { LeadTableActionHandlerDeps } from "./leads-crm-action-handler.ts";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";

function makeRow(overrides: Partial<LeadWorkspaceRow> = {}): LeadWorkspaceRow {
  return {
    id: "lead-1",
    tenantId: "tenant-1",
    name: "Acme Lead",
    contactPerson: "Jane Doe",
    companyName: "Acme",
    stage: "qualified",
    stageId: "stage-1",
    lifecycleStatus: "active",
    owner: "Owner",
    ownerId: "user-1",
    source: "web",
    priority: "normal",
    expectedValue: 1000,
    currency: "SAR",
    email: "jane@acme.test",
    phone: "+966501234567",
    customerId: null,
    tags: [],
    notes: "",
    temperature: "warm",
    score: 72,
    expectedCloseDate: null,
    lastActivityAt: "2026-08-08T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    pipelineId: "pipe-1",
    isQualified: true,
    ...overrides,
  } as LeadWorkspaceRow;
}

function makeDeps(overrides: Partial<LeadTableActionHandlerDeps> = {}): LeadTableActionHandlerDeps {
  const toasts: Array<{ title: string; variant?: string }> = [];
  const row = makeRow();
  return {
    row,
    t: (key) => key,
    toast: (options) => {
      toasts.push(options);
    },
    failToast: (title) => {
      toasts.push({ title, variant: "destructive" });
    },
    commands: {
      convert: {
        mutateAsync: async () => ({ ok: true }),
      },
      archive: {
        mutateAsync: async () => undefined,
      },
    },
    openLead360: () => {},
    setOpportunityId: () => {},
    openCreateOpportunityDialog: () => {},
    setEditLead: () => {},
    setEditOpen: () => {},
    setActionLead: () => {},
    setAssignOpen: () => {},
    setActivityOpen: () => {},
    setDeleteOpen: () => {},
    setSelectedLead: () => {},
    whatsApp: {
      hasIntegration: false,
      channelId: null,
      companyId: undefined,
      openPlatform: async () => {},
    },
    ...overrides,
  };
}

describe("executeLeadTableActionRoute", () => {
  it("Create Opportunity opens create dialog instead of immediate create", async () => {
    let dialogLead: LeadWorkspaceRow | null = null;

    const deps = makeDeps({
      openCreateOpportunityDialog: (lead) => {
        dialogLead = lead;
      },
    });

    await executeLeadTableActionRoute(
      { kind: "openDialog", dialog: "createOpportunity" },
      deps,
    );

    assert.equal(dialogLead?.id, "lead-1");
  });

  it("Convert invokes convertLead and shows success toast", async () => {
    let convertLeadId: string | null = null;
    const successToasts: string[] = [];

    const deps = makeDeps({
      commands: {
        convert: {
          mutateAsync: async ({ leadId }) => {
            convertLeadId = leadId;
            return { opportunityId: null };
          },
        },
        archive: { mutateAsync: async () => undefined },
      },
      toast: ({ title }) => {
        successToasts.push(title);
      },
    });

    await executeLeadTableActionRoute({ kind: "command", command: "convert" }, deps);

    assert.equal(convertLeadId, "lead-1");
    assert.deepEqual(successToasts, ["leads.kanban.actions.converted"]);
  });

  it("Convert opens Opportunity360 when convert returns opportunityId", async () => {
    let openedOpportunityId: string | null = null;

    const deps = makeDeps({
      commands: {
        convert: {
          mutateAsync: async () => ({ opportunityId: "opp-from-convert" }),
        },
        archive: { mutateAsync: async () => undefined },
      },
      setOpportunityId: (id) => {
        openedOpportunityId = id;
      },
    });

    await executeLeadTableActionRoute({ kind: "command", command: "convert" }, deps);

    assert.equal(openedOpportunityId, "opp-from-convert");
  });

  it("Convert shows error toast when convertLead throws", async () => {
    const errors: string[] = [];
    const deps = makeDeps({
      commands: {
        convert: {
          mutateAsync: async () => {
            throw new Error("convert blocked");
          },
        },
        archive: { mutateAsync: async () => undefined },
      },
      failToast: (title, error) => {
        errors.push(`${title}:${error instanceof Error ? error.message : String(error)}`);
      },
    });

    await executeLeadTableActionRoute({ kind: "command", command: "convert" }, deps);

    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /convertFailed:convert blocked/);
  });
});

describe("executeLeadTableAction", () => {
  it("routes createOpportunity menu action to create dialog", async () => {
    let opened = false;
    const deps = makeDeps({
      openCreateOpportunityDialog: () => {
        opened = true;
      },
    });

    await executeLeadTableAction("createOpportunity", deps);
    assert.equal(opened, true);
    assert.deepEqual(routeForLeadTableAction("createOpportunity"), {
      kind: "openDialog",
      dialog: "createOpportunity",
    });
  });

  it("Create Opportunity dialog receives converted lead row", async () => {
    let dialogLead: LeadWorkspaceRow | null = null;

    const deps = makeDeps({
      row: makeRow({
        lifecycleStatus: "converted",
        customerId: "cust-1",
        isQualified: true,
      }),
      openCreateOpportunityDialog: (lead) => {
        dialogLead = lead;
      },
    });

    await executeLeadTableAction("createOpportunity", deps);

    assert.equal(dialogLead?.id, "lead-1");
    assert.equal(dialogLead?.customerId, "cust-1");
  });

  it("routes convert menu action to convertLead", async () => {
    let invoked = false;
    const deps = makeDeps({
      commands: {
        convert: {
          mutateAsync: async () => {
            invoked = true;
            return { ok: true };
          },
        },
        archive: { mutateAsync: async () => undefined },
      },
    });

    await executeLeadTableAction("convert", deps);
    assert.equal(invoked, true);
    assert.deepEqual(routeForLeadTableAction("convert"), {
      kind: "command",
      command: "convert",
    });
  });
});
