import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AssignableEmployee } from "@workspace/assignment-governance";
import {
  filterAssignableEmployeesBySearch,
  formatAssignableDepartmentLabel,
  formatAssignableEmployeeLabel,
} from "./assignable-employee-labels.ts";
import { buildAssignableEmailSelectOptions } from "./assignable-select-options.ts";
import { EMAIL_CONVERSATION_UNASSIGNED_VALUE } from "../email-workspace/email-conversation-assignment.ts";

const here = dirname(fileURLToPath(import.meta.url));

const sample: AssignableEmployee = {
  userId: "user-1",
  companyId: "company-1",
  departmentId: "dept-a",
  departmentName: "Support",
  branchId: "branch-a",
  branchName: "Branch A",
  fullName: "Sara Ahmed",
  email: "sara@example.com",
  isActive: true,
};

describe("assignable employees UI helpers", () => {
  it("9. branch-aware labels", () => {
    assert.equal(formatAssignableDepartmentLabel(sample), "Support — Branch A");
    assert.match(formatAssignableEmployeeLabel(sample), /Support — Branch A/);
  });

  it("10. client search stays within authorized candidates", () => {
    const other: AssignableEmployee = {
      ...sample,
      userId: "user-2",
      fullName: "Other Dept",
      departmentId: "dept-b",
      departmentName: "Billing",
      branchName: "Branch B",
    };
    // Only `sample` is in the authorized set passed to search.
    const hits = filterAssignableEmployeesBySearch([sample], "Billing");
    assert.equal(hits.length, 0);
    assert.equal(filterAssignableEmployeesBySearch([sample, other], "billing").length, 1);
  });

  it("11-12. empty eligible state + Unassigned sentinel", () => {
    const empty = buildAssignableEmailSelectOptions({
      employees: [],
      assignedUserId: null,
      unassignedLabel: "Unassigned",
    });
    assert.equal(empty[0]?.value, EMAIL_CONVERSATION_UNASSIGNED_VALUE);
    assert.equal(empty.length, 1);

    const withPeople = buildAssignableEmailSelectOptions({
      employees: [sample],
      assignedUserId: null,
      unassignedLabel: "Unassigned",
    });
    assert.equal(withPeople[0]?.value, EMAIL_CONVERSATION_UNASSIGNED_VALUE);
    assert.equal(withPeople[1]?.value, "user-1");
  });

  it("14-19. assignment UIs consume canonical assignable source", () => {
    const emailControl = readFileSync(
      join(here, "../../components/email/email-conversation-assignee-control.tsx"),
      "utf8",
    );
    assert.match(emailControl, /useAssignableEmployees/);
    assert.doesNotMatch(emailControl, /EmployeeIdentityService\.listByCompany/);

    const tickets = readFileSync(join(here, "../../pages/dashboard/tickets-page.tsx"), "utf8");
    assert.match(tickets, /useAssignableEmployees/);
    assert.match(tickets, /resource:\s*"ticket"/);

    const leadsTable = readFileSync(
      join(here, "../../pages/dashboard/leads/leads-table-page.tsx"),
      "utf8",
    );
    assert.match(leadsTable, /useAssignableEmployees/);
    assert.match(leadsTable, /resource:\s*"lead"/);

    const leadsKanban = readFileSync(
      join(here, "../../pages/dashboard/leads/leads-kanban-page.tsx"),
      "utf8",
    );
    assert.match(leadsKanban, /useAssignableEmployees/);

    const handoff = readFileSync(
      join(here, "../../components/omnichannel/assignment-sheet.tsx"),
      "utf8",
    );
    assert.match(handoff, /useAssignableEmployees/);
    assert.match(handoff, /resource:\s*"handoff"/);
    assert.match(handoff, /queues/);
  });

  it("20-21. AI routing / opportunity ownership untouched by Phase 4 list wiring", () => {
    const emailRouting = readFileSync(
      join(
        here,
        "../../../../api-server/src/platform/email-routing-ticket-adapter.ts",
      ),
      "utf8",
    );
    assert.match(emailRouting, /assignmentGovernance:\s*false/);

    const opp = readFileSync(
      join(here, "../../hooks/opportunities/use-opportunity-create-form-options.ts"),
      "utf8",
    );
    assert.match(opp, /EmployeeIdentityService\.listByCompany/);
    assert.doesNotMatch(opp, /useAssignableEmployees/);
  });

  it("tasks have no assignee picker UI (documented)", () => {
    const taskWrite = readFileSync(
      join(here, "../application-layer/adapters/task-write-port-adapter.ts"),
      "utf8",
    );
    assert.match(taskWrite, /assertTaskAssigneeEligible|AssignmentGovernance/);
  });
});
