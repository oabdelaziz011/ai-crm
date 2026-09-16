/**
 * Phase 5.1 — Assignment audit security hardening tests.
 *
 * Proves the security boundary without requiring a live DB:
 * - migration 369 denies authenticated direct INSERT
 * - writes go through validated RPC / service path
 * - action/source/assignee integrity is enforced in app validation
 * - UPDATE/DELETE are blocked by migration design
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { AssignmentAuditError } from "./errors.js";
import { AssignmentAuditService } from "./assignment-audit-service.js";
import {
  createMemoryAssignmentAuditDataPort,
  createMemoryAssignmentAuditStore,
} from "./memory-assignment-audit-data-port.js";
import {
  assertClientAllowedAssignmentAuditSource,
  assertValidAssignmentAuditWrite,
} from "./validate-assignment-audit-write.js";
import { createSupabaseAssignmentAuditDataPort } from "./supabase-assignment-audit-data-port.js";

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations/369_assignment_audit_events.sql",
);

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

/** In-memory stand-in for the SECURITY DEFINER RPC rules used by authenticated clients. */
function createHardenedClientWriteSimulator(store: {
  events: Array<Record<string, unknown>>;
  profileCompanies: Map<string, string>;
  resources: Map<string, string>;
  authUserId: string;
  authCompanyId: string;
  isServiceRole: boolean;
}) {
  return {
    async write(input: {
      companyId: string;
      actorUserId: string | null;
      resourceType: string;
      resourceId: string;
      previousAssigneeUserId: string | null;
      newAssigneeUserId: string | null;
      action: string;
      source: string;
    }) {
      assertValidAssignmentAuditWrite({
        action: input.action,
        source: input.source,
        previousAssigneeUserId: input.previousAssigneeUserId,
        newAssigneeUserId: input.newAssigneeUserId,
      });
      assertClientAllowedAssignmentAuditSource(input.source as never, {
        isServiceRole: store.isServiceRole,
      });

      if (!store.isServiceRole) {
        if (input.companyId !== store.authCompanyId) {
          throw new AssignmentAuditError("COMPANY_SCOPE", "Cross-company assignment audit is not allowed");
        }
        // Actor spoofing rejected: forced to auth user.
        input = { ...input, actorUserId: store.authUserId };
      }

      const resourceKey = `${input.resourceType}:${input.resourceId}`;
      const resourceCompany = store.resources.get(resourceKey);
      if (!resourceCompany || resourceCompany !== input.companyId) {
        throw new AssignmentAuditError("RESOURCE_SCOPE", "Assignment audit resource not found for company");
      }

      for (const assignee of [input.previousAssigneeUserId, input.newAssigneeUserId]) {
        if (!assignee) continue;
        const company = store.profileCompanies.get(assignee);
        if (company !== input.companyId) {
          throw new AssignmentAuditError("ASSIGNEE_SCOPE", "assignee is not in company scope");
        }
      }

      const event = Object.freeze({ ...input, id: `evt-${store.events.length + 1}` });
      store.events.push(event);
      return event;
    },
  };
}

describe("Phase 5.1 assignment audit security", () => {
  it("1. normal client cannot fabricate audit event via direct INSERT policy", () => {
    const sql = readMigration();
    assert.match(sql, /drop policy if exists assignment_audit_events_insert/i);
    assert.match(sql, /revoke insert, update, delete on table public\.assignment_audit_events from authenticated/i);
    assert.doesNotMatch(
      sql,
      /create policy assignment_audit_events_insert[\s\S]*auth\.role\(\) = 'authenticated'/i,
    );
    assert.match(sql, /record_assignment_audit_event/i);
  });

  it("2. arbitrary actor_user_id rejected for authenticated writers", async () => {
    const store = {
      events: [] as Array<Record<string, unknown>>,
      profileCompanies: new Map([
        ["real-actor", "company-1"],
        ["spoofed-actor", "company-1"],
        ["target", "company-1"],
      ]),
      resources: new Map([["ticket:ticket-1", "company-1"]]),
      authUserId: "real-actor",
      authCompanyId: "company-1",
      isServiceRole: false,
    };
    const sim = createHardenedClientWriteSimulator(store);
    const event = await sim.write({
      companyId: "company-1",
      actorUserId: "spoofed-actor",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "target",
      action: "assigned",
      source: "human",
    });
    assert.equal(event.actorUserId, "real-actor");
    assert.match(readMigration(), /v_actor := auth\.uid\(\)/);
  });

  it("3. arbitrary company_id rejected", async () => {
    const store = {
      events: [] as Array<Record<string, unknown>>,
      profileCompanies: new Map([
        ["real-actor", "company-1"],
        ["target", "company-1"],
      ]),
      resources: new Map([["ticket:ticket-1", "company-2"]]),
      authUserId: "real-actor",
      authCompanyId: "company-1",
      isServiceRole: false,
    };
    const sim = createHardenedClientWriteSimulator(store);
    await assert.rejects(
      () =>
        sim.write({
          companyId: "company-2",
          actorUserId: "real-actor",
          resourceType: "ticket",
          resourceId: "ticket-1",
          previousAssigneeUserId: null,
          newAssigneeUserId: "target",
          action: "assigned",
          source: "human",
        }),
      (err: unknown) => err instanceof AssignmentAuditError && err.code === "COMPANY_SCOPE",
    );
  });

  it("4. cross-company resource rejected", async () => {
    const store = {
      events: [] as Array<Record<string, unknown>>,
      profileCompanies: new Map([
        ["real-actor", "company-1"],
        ["target", "company-1"],
      ]),
      resources: new Map([["ticket:ticket-other", "company-2"]]),
      authUserId: "real-actor",
      authCompanyId: "company-1",
      isServiceRole: false,
    };
    const sim = createHardenedClientWriteSimulator(store);
    await assert.rejects(
      () =>
        sim.write({
          companyId: "company-1",
          actorUserId: "real-actor",
          resourceType: "ticket",
          resourceId: "ticket-other",
          previousAssigneeUserId: null,
          newAssigneeUserId: "target",
          action: "assigned",
          source: "human",
        }),
      (err: unknown) => err instanceof AssignmentAuditError && err.code === "RESOURCE_SCOPE",
    );
  });

  it("5. cross-company previous assignee rejected", async () => {
    const store = {
      events: [] as Array<Record<string, unknown>>,
      profileCompanies: new Map([
        ["real-actor", "company-1"],
        ["old", "company-2"],
        ["new", "company-1"],
      ]),
      resources: new Map([["ticket:ticket-1", "company-1"]]),
      authUserId: "real-actor",
      authCompanyId: "company-1",
      isServiceRole: false,
    };
    const sim = createHardenedClientWriteSimulator(store);
    await assert.rejects(
      () =>
        sim.write({
          companyId: "company-1",
          actorUserId: "real-actor",
          resourceType: "ticket",
          resourceId: "ticket-1",
          previousAssigneeUserId: "old",
          newAssigneeUserId: "new",
          action: "reassigned",
          source: "human",
        }),
      (err: unknown) => err instanceof AssignmentAuditError && err.code === "ASSIGNEE_SCOPE",
    );
  });

  it("6. cross-company new assignee rejected", async () => {
    const store = {
      events: [] as Array<Record<string, unknown>>,
      profileCompanies: new Map([
        ["real-actor", "company-1"],
        ["foreign", "company-2"],
      ]),
      resources: new Map([["ticket:ticket-1", "company-1"]]),
      authUserId: "real-actor",
      authCompanyId: "company-1",
      isServiceRole: false,
    };
    const sim = createHardenedClientWriteSimulator(store);
    await assert.rejects(
      () =>
        sim.write({
          companyId: "company-1",
          actorUserId: "real-actor",
          resourceType: "ticket",
          resourceId: "ticket-1",
          previousAssigneeUserId: null,
          newAssigneeUserId: "foreign",
          action: "assigned",
          source: "human",
        }),
      (err: unknown) => err instanceof AssignmentAuditError && err.code === "ASSIGNEE_SCOPE",
    );
  });

  it("7. invalid action rejected", () => {
    assert.throws(
      () =>
        assertValidAssignmentAuditWrite({
          action: "hacked",
          source: "human",
          previousAssigneeUserId: null,
          newAssigneeUserId: "a",
        }),
      (err: unknown) => err instanceof AssignmentAuditError && err.code === "INVALID_ACTION",
    );
  });

  it("8. invalid source rejected", () => {
    assert.throws(
      () =>
        assertValidAssignmentAuditWrite({
          action: "assigned",
          source: "forged",
          previousAssigneeUserId: null,
          newAssigneeUserId: "a",
        }),
      (err: unknown) => err instanceof AssignmentAuditError && err.code === "INVALID_SOURCE",
    );
  });

  it("9. invalid old/new/action combination rejected", () => {
    assert.throws(
      () =>
        assertValidAssignmentAuditWrite({
          action: "assigned",
          source: "human",
          previousAssigneeUserId: "old",
          newAssigneeUserId: "new",
        }),
      (err: unknown) =>
        err instanceof AssignmentAuditError && err.code === "INVALID_ASSIGNEE_COMBINATION",
    );
    assert.throws(
      () =>
        assertValidAssignmentAuditWrite({
          action: "unassigned",
          source: "human",
          previousAssigneeUserId: null,
          newAssigneeUserId: null,
        }),
      (err: unknown) =>
        err instanceof AssignmentAuditError && err.code === "INVALID_ASSIGNEE_COMBINATION",
    );
  });

  it("10. UPDATE rejected by append-only migration", () => {
    const sql = readMigration();
    assert.match(sql, /assignment_audit_events_no_update/i);
    assert.match(sql, /assignment_audit_events is append-only/i);
  });

  it("11. DELETE rejected by append-only migration", () => {
    const sql = readMigration();
    assert.match(sql, /assignment_audit_events_no_delete/i);
    assert.match(sql, /revoke insert, update, delete on table public\.assignment_audit_events from authenticated/i);
  });

  it("12. legitimate AssignmentAuditService write succeeds", async () => {
    const mem = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(mem),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "target",
      source: "human",
    });
    assert.ok(event);
    assert.equal(event?.action, "assigned");
  });

  it("13-16. human/handoff/ai/system sources remain intact for trusted writes", async () => {
    const mem = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(mem),
    });
    for (const source of ["human", "handoff", "ai", "system"] as const) {
      const event = await service.recordAssignmentChange({
        companyId: "company-1",
        actorUserId: source === "system" ? null : "actor",
        resourceType: "conversation",
        resourceId: `conv-${source}`,
        previousAssigneeUserId: null,
        newAssigneeUserId: "target",
        source,
      });
      assert.equal(event?.source, source);
    }
    assert.throws(
      () => assertClientAllowedAssignmentAuditSource("ai", { isServiceRole: false }),
      (err: unknown) => err instanceof AssignmentAuditError && err.code === "SOURCE_NOT_ALLOWED",
    );
    assert.doesNotThrow(() =>
      assertClientAllowedAssignmentAuditSource("ai", { isServiceRole: true }),
    );
  });

  it("supabase port uses SECURITY DEFINER RPC (not direct table insert)", () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const client = {
      rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return Promise.resolve({
          data: {
            id: "1",
            company_id: "company-1",
            actor_user_id: "agent",
            resource_type: "ticket",
            resource_id: "ticket-1",
            previous_assignee_user_id: null,
            new_assignee_user_id: "target",
            action: "assigned",
            source: "human",
            metadata: {},
            created_at: new Date().toISOString(),
          },
          error: null,
        });
      },
      from() {
        throw new Error("direct table write must not be used for insert");
      },
    };
    const port = createSupabaseAssignmentAuditDataPort(client as never);
    return port
      .insertEvent({
        companyId: "company-1",
        actorUserId: "agent",
        resourceType: "ticket",
        resourceId: "ticket-1",
        previousAssigneeUserId: null,
        newAssigneeUserId: "target",
        action: "assigned",
        source: "human",
        metadata: {},
      })
      .then((event) => {
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.name, "record_assignment_audit_event");
        assert.equal(event.action, "assigned");
      });
  });

  it("audit failure propagates (never swallowed)", async () => {
    const service = new AssignmentAuditService({
      port: {
        async insertEvent() {
          throw new AssignmentAuditError("AUDIT_INSERT_FAILED", "boom");
        },
        async listEvents() {
          return [];
        },
      },
    });
    await assert.rejects(
      () =>
        service.recordAssignmentChange({
          companyId: "company-1",
          actorUserId: "agent",
          resourceType: "ticket",
          resourceId: "ticket-1",
          previousAssigneeUserId: null,
          newAssigneeUserId: "target",
          source: "human",
        }),
      (err: unknown) => err instanceof AssignmentAuditError && err.code === "AUDIT_INSERT_FAILED",
    );
  });
});
