/**
 * Email Workspace Assigned To filter — URL parse + list query mapping.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  EMAIL_WORKSPACE_ASSIGNEE_ALL,
  EMAIL_WORKSPACE_ASSIGNEE_QUERY_KEY,
  EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED,
  assigneeFilterToListAssignedUserId,
  parseEmailWorkspaceAssigneeFilter,
  readEmailWorkspaceAssigneeFromSearch,
  writeAssigneeToSearchParams,
} from "./email-workspace-assignee-filter.ts";
import { applyConversationListVisibilityFilter } from "../../../../../lib/ai-conversation/src/services/conversation-visibility.ts";

const here = dirname(fileURLToPath(import.meta.url));
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

describe("email-workspace-assignee-filter", () => {
  it("A. All maps to undefined list predicate (existing visibility unchanged)", () => {
    assert.equal(parseEmailWorkspaceAssigneeFilter(null), EMAIL_WORKSPACE_ASSIGNEE_ALL);
    assert.equal(parseEmailWorkspaceAssigneeFilter("all"), EMAIL_WORKSPACE_ASSIGNEE_ALL);
    assert.equal(assigneeFilterToListAssignedUserId(EMAIL_WORKSPACE_ASSIGNEE_ALL), undefined);
  });

  it("B. Unassigned maps to null (assigned_user_id IS NULL)", () => {
    assert.equal(
      parseEmailWorkspaceAssigneeFilter("unassigned"),
      EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED,
    );
    assert.equal(assigneeFilterToListAssignedUserId(EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED), null);
  });

  it("C. Specific user maps to that auth user id", () => {
    assert.equal(parseEmailWorkspaceAssigneeFilter(USER_A), USER_A);
    assert.equal(assigneeFilterToListAssignedUserId(USER_A), USER_A);
  });

  it("invalid values fail closed to All", () => {
    assert.equal(parseEmailWorkspaceAssigneeFilter("not-a-uuid"), EMAIL_WORKSPACE_ASSIGNEE_ALL);
    assert.equal(parseEmailWorkspaceAssigneeFilter("../../../x"), EMAIL_WORKSPACE_ASSIGNEE_ALL);
  });

  it("reads and writes URL assignee param", () => {
    assert.equal(
      readEmailWorkspaceAssigneeFromSearch(`?metric=incoming&assignee=${USER_A}`),
      USER_A,
    );
    const params = new URLSearchParams("metric=incoming");
    writeAssigneeToSearchParams(params, USER_A);
    assert.equal(params.get(EMAIL_WORKSPACE_ASSIGNEE_QUERY_KEY), USER_A);
    writeAssigneeToSearchParams(params, EMAIL_WORKSPACE_ASSIGNEE_ALL);
    assert.equal(params.get(EMAIL_WORKSPACE_ASSIGNEE_QUERY_KEY), null);
  });

  it("metric search builder preserves assignee across navigation (source contract)", () => {
    const metricSrc = readFileSync(join(here, "./email-workspace-metric-filter.ts"), "utf8");
    assert.match(metricSrc, /writeAssigneeToSearchParams\(params, input\.assignee\)/);
    assert.match(metricSrc, /assignee\?: EmailWorkspaceAssigneeFilter/);
  });

  it("D/H. visibility composition: View Assigned cannot expand via other-user filter", () => {
    const narrowed = applyConversationListVisibilityFilter(
      { assignedUserId: USER_B, searchQuery: "hello", companyId: "c1" },
      {
        mode: "assigned",
        userId: USER_A,
        departmentId: null,
        managedDepartmentIds: [],
      },
    );
    assert.equal(narrowed.assignedUserId, USER_A);
    assert.equal(narrowed.searchQuery, "hello");
  });

  it("D. View All keeps requested assignee filter", () => {
    const kept = applyConversationListVisibilityFilter(
      { assignedUserId: USER_B, searchQuery: "invoice", companyId: "c1" },
      { mode: "all" },
    );
    assert.equal(kept.assignedUserId, USER_B);
    assert.equal(kept.searchQuery, "invoice");
  });

  it("F. Unassigned + search both survive visibility pass-through for View All", () => {
    const filters = applyConversationListVisibilityFilter(
      { assignedUserId: null, searchQuery: "support", companyId: "c1" },
      { mode: "all" },
    );
    assert.equal(filters.assignedUserId, null);
    assert.equal(filters.searchQuery, "support");
  });
});

describe("email-workspace-assignee-filter panel contracts", () => {
  const panelSrc = readFileSync(join(here, "../../components/email/email-workspace-panel.tsx"), "utf8");
  const en = JSON.parse(readFileSync(join(here, "../../locales/en/common.json"), "utf8"));
  const ar = JSON.parse(readFileSync(join(here, "../../locales/ar/common.json"), "utf8"));

  it("wires assignedUserId into listFilters via assignee helper", () => {
    assert.match(panelSrc, /assignedUserId: assigneeFilterToListAssignedUserId\(assigneeFilter\)/);
    assert.match(panelSrc, /EmployeeIdentityService\.listByCompany/);
    assert.match(panelSrc, /data-testid="email-workspace-assignee-filter"/);
    assert.doesNotMatch(panelSrc, /useAssignableEmployees\(\{[\s\S]*assigneeFilter/);
  });

  it("G. realtime keeps existing invalidation (list query key includes filters)", () => {
    assert.match(panelSrc, /useEmailWorkspaceRealtime\(companyId, selectedId/);
    assert.match(panelSrc, /useConversationList\(listFilters, 100\)/);
  });

  it("J. filter does not call assign/persist APIs", () => {
    assert.doesNotMatch(
      panelSrc,
      /setAssigneeFilter[\s\S]{0,200}persistEmailConversationAssignee|assignConversation/,
    );
  });

  it("I. Arabic/English labels", () => {
    const enWs = en.emailModule.workspace;
    const arWs = ar.emailModule.workspace;
    assert.equal(enWs.filterAssignedTo, "Assigned to");
    assert.equal(enWs.filterAssigneeAll, "All");
    assert.equal(enWs.filterAssigneeUnassigned, "Unassigned");
    assert.equal(enWs.emptyUnassignedList, "No unassigned conversations.");
    assert.equal(enWs.emptyAssigneeList, "No conversations assigned to this user.");
    assert.equal(arWs.filterAssignedTo, "المعيّن إلى");
    assert.equal(arWs.filterAssigneeAll, "الكل");
    assert.equal(arWs.filterAssigneeUnassigned, "غير معيّن");
    assert.equal(arWs.emptyUnassignedList, "لا توجد محادثات غير معيّنة.");
    assert.equal(arWs.emptyAssigneeList, "لا توجد محادثات معيّنة لهذا المستخدم.");
  });

  it("E. repository applies assignee before limit (server-side filter contract)", () => {
    const repoSrc = readFileSync(
      join(here, "../../../../../lib/ai-conversation/src/repositories/supabase-conversation-repository.ts"),
      "utf8",
    );
    assert.match(repoSrc, /filter\.assignedUserId !== undefined/);
    assert.match(repoSrc, /\.is\("assigned_user_id", null\)/);
    assert.match(repoSrc, /\.eq\("assigned_user_id", filter\.assignedUserId\)/);
    assert.match(repoSrc, /limit\(filter\.limit/);
  });
});
