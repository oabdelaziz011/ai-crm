import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertStatusTransition,
  isReopenTransition,
  isTerminalStatus,
} from "../validators/status-transition-validator.js";
import {
  computeSlaCompliancePercent,
  computeSlaDueAt,
  isSlaBreached,
  isSlaWarning,
  resolveSlaHoursByPriority,
  resolveSlaWarningHours,
} from "../services/ticket-sla-service.js";
import { TicketStatusTransitionError, TicketValidationError } from "../errors.js";
import { readPriority, readRequiredString } from "../validators/ticket-validators.js";
import { TicketCommandService } from "../services/ticket-command-service.js";
import type { TicketSlaSettingsPort } from "../ports/ticket-platform-ports.js";
import type { TicketCommentRepository, TicketRepository } from "../repositories/ticket-repository-port.js";
import type { TicketRecord } from "../types/ticket-types.js";

describe("status transition validator", () => {
  it("allows open to in_progress", () => {
    assert.doesNotThrow(() => assertStatusTransition("open", "in_progress"));
  });

  it("blocks closed to in_progress without reopen path", () => {
    assert.throws(
      () => assertStatusTransition("closed", "in_progress"),
      TicketStatusTransitionError,
    );
  });

  it("detects reopen transition", () => {
    assert.equal(isReopenTransition("closed", "open"), true);
    assert.equal(isTerminalStatus("resolved"), true);
  });
});

describe("ticket SLA service", () => {
  it("computes SLA due date from priority defaults", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const due = computeSlaDueAt("urgent", now);
    assert.equal(due, "2026-08-01T16:00:00.000Z");
  });

  it("computes SLA due date from company hours map", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const due = computeSlaDueAt("urgent", now, {
      urgent: 2,
      high: 8,
      normal: 24,
      low: 72,
    });
    assert.equal(due, "2026-08-01T14:00:00.000Z");
  });

  it("resolves company hours and warning with defaults fallback", () => {
    assert.deepEqual(resolveSlaHoursByPriority(null), {
      urgent: 4,
      high: 8,
      normal: 24,
      low: 72,
    });
    assert.equal(resolveSlaWarningHours(null), 1);
    assert.deepEqual(
      resolveSlaHoursByPriority({
        companyId: "c1",
        urgentHours: 1,
        highHours: 2,
        normalHours: 3,
        lowHours: 4,
        warningHours: 2,
      }),
      { urgent: 1, high: 2, normal: 3, low: 4 },
    );
    assert.equal(
      resolveSlaWarningHours({
        companyId: "c1",
        urgentHours: 1,
        highHours: 2,
        normalHours: 3,
        lowHours: 4,
        warningHours: 2,
      }),
      2,
    );
  });

  it("detects SLA breach and warning windows", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    assert.equal(isSlaBreached("2026-08-01T11:00:00.000Z", now), true);
    assert.equal(isSlaWarning("2026-08-01T12:30:00.000Z", now, 1), true);
    assert.equal(computeSlaCompliancePercent(10, 2), 80);
  });
});

describe("ticket validators", () => {
  it("validates required strings and priorities", () => {
    assert.equal(readRequiredString("  hello ", "Field"), "hello");
    assert.throws(() => readRequiredString(" ", "Field"), TicketValidationError);
    assert.equal(readPriority("HIGH"), "high");
    assert.throws(() => readPriority("invalid"), TicketValidationError);
  });
});

describe("ticket command SLA resolution", () => {
  it("createTicket uses company SLA hours when available", async () => {
    const created: TicketRecord[] = [];
    const tickets = {
      async generateTicketNumber() {
        return "TKT-000099";
      },
      async create(input: {
        companyId: string;
        ticketNumber: string;
        subject: string;
        description: string;
        status: TicketRecord["status"];
        priority: TicketRecord["priority"];
        customerId: string | null;
        conversationId: string | null;
        createdBy: string;
        slaDueAt: string;
      }) {
        const record: TicketRecord = {
          id: "t1",
          companyId: input.companyId,
          ticketNumber: input.ticketNumber,
          subject: input.subject,
          description: input.description,
          status: input.status,
          priority: input.priority,
          customerId: input.customerId,
          conversationId: input.conversationId,
          assignedUserId: null,
          assignedUserName: null,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          closedAt: null,
          closedBy: null,
          reopenedAt: null,
          reopenedBy: null,
          slaDueAt: input.slaDueAt,
          firstResponseAt: null,
          resolvedAt: null,
          metadata: {},
          createdAt: "2026-08-01T12:00:00.000Z",
          updatedAt: "2026-08-01T12:00:00.000Z",
          deletedAt: null,
        };
        created.push(record);
        return record;
      },
      async update() {
        throw new Error("unused");
      },
      async softDelete() {
        throw new Error("unused");
      },
      async findById() {
        return null;
      },
      async search() {
        return { tickets: [], total: 0 };
      },
      async listByCustomer() {
        return [];
      },
      async listByConversation() {
        return [];
      },
      async countOpenByCustomer() {
        return 0;
      },
      async fetchCustomerSnapshot() {
        throw new Error("unused");
      },
      async fetchMetrics() {
        throw new Error("unused");
      },
    } as unknown as TicketRepository;

    const comments = {
      async add() {
        throw new Error("unused");
      },
      async listByTicket() {
        return [];
      },
    } as unknown as TicketCommentRepository;

    const slaSettings: TicketSlaSettingsPort = {
      async getByCompanyId() {
        return {
          companyId: "company-1",
          urgentHours: 2,
          highHours: 8,
          normalHours: 24,
          lowHours: 72,
          warningHours: 1,
        };
      },
    };

    const service = new TicketCommandService({
      tickets,
      comments,
      assignees: {
        async resolveAssigneeUserId() {
          return "u1";
        },
        async loadAssigneeNames() {
          return new Map();
        },
        async findAssigneeCandidates() {
          return [];
        },
      },
      events: { async publish() {} },
      notifications: { async notify() {} },
      audit: { async write() {} },
      slaSettings,
    });

    const before = Date.now();
    const result = await service.createTicket(
      {
        companyId: "company-1",
        userId: "actor-1",
        isSuperAdmin: false,
        hasPermission: (code) => code === "tickets.create",
      },
      {
        companyId: "company-1",
        subject: "SLA company hours",
        priority: "urgent",
      },
    );
    const after = Date.now();

    assert.ok(created[0]?.slaDueAt);
    const dueMs = new Date(created[0]!.slaDueAt!).getTime();
    const expectedMin = before + 2 * 60 * 60 * 1000;
    const expectedMax = after + 2 * 60 * 60 * 1000;
    assert.ok(
      dueMs >= expectedMin && dueMs <= expectedMax,
      `expected ~2h SLA due, got ${created[0]!.slaDueAt}`,
    );
    assert.equal(result.ticket.priority, "urgent");
  });

  it("createTicket still succeeds when event publish throws after insert", async () => {
    const tickets = {
      async generateTicketNumber() {
        return "TKT-000100";
      },
      async create(input: {
        companyId: string;
        ticketNumber: string;
        subject: string;
        description: string;
        status: TicketRecord["status"];
        priority: TicketRecord["priority"];
        customerId: string | null;
        conversationId: string | null;
        createdBy: string;
        slaDueAt: string;
      }) {
        const record: TicketRecord = {
          id: "t-event-fail",
          companyId: input.companyId,
          ticketNumber: input.ticketNumber,
          subject: input.subject,
          description: input.description,
          status: input.status,
          priority: input.priority,
          customerId: input.customerId,
          conversationId: input.conversationId,
          assignedUserId: null,
          assignedUserName: null,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          closedAt: null,
          closedBy: null,
          reopenedAt: null,
          reopenedBy: null,
          slaDueAt: input.slaDueAt,
          firstResponseAt: null,
          resolvedAt: null,
          metadata: {},
          createdAt: "2026-08-01T12:00:00.000Z",
          updatedAt: "2026-08-01T12:00:00.000Z",
          deletedAt: null,
        };
        return record;
      },
      async update() {
        throw new Error("unused");
      },
      async softDelete() {
        throw new Error("unused");
      },
      async findById() {
        return null;
      },
      async search() {
        return { tickets: [], total: 0 };
      },
      async listByCustomer() {
        return [];
      },
      async listByConversation() {
        return [];
      },
      async countOpenByCustomer() {
        return 0;
      },
      async fetchCustomerSnapshot() {
        throw new Error("unused");
      },
      async fetchMetrics() {
        throw new Error("unused");
      },
    } as unknown as TicketRepository;

    const service = new TicketCommandService({
      tickets,
      comments: {
        async add() {
          throw new Error("unused");
        },
        async listByTicket() {
          return [];
        },
      } as unknown as TicketCommentRepository,
      assignees: {
        async resolveAssigneeUserId() {
          return "u1";
        },
        async loadAssigneeNames() {
          return new Map();
        },
        async findAssigneeCandidates() {
          return [];
        },
      },
      events: {
        async publish() {
          throw new Error("permission denied for function current_company_id");
        },
      },
      notifications: { async notify() {} },
      audit: { async write() {} },
      slaSettings: {
        async getByCompanyId() {
          return null;
        },
      },
    });

    const result = await service.createTicket(
      {
        companyId: "company-1",
        userId: "actor-1",
        isSuperAdmin: false,
        hasPermission: (code) => code === "tickets.create",
      },
      {
        companyId: "company-1",
        subject: "Complaint still opens",
        priority: "high",
      },
    );

    assert.equal(result.ticket.ticketNumber, "TKT-000100");
    assert.equal(result.ticket.subject, "Complaint still opens");
  });
});
