/**
 * Phase 5 Companies workspace tab filter unit tests.
 * Run: node --experimental-strip-types artifacts/login-app/scripts/company-approval-filters.test.mts
 */
import assert from "node:assert/strict";
import {
  countCompaniesByWorkspaceTab,
  matchesCompanyWorkspaceTab,
  resolveCompanyApprovalStatus,
} from "../src/lib/companies/company-list-filters.ts";

console.log("\nCompany workspace tab filters (Phase 5)\n");

const pending = { status: "Trial" as const, approval_status: "pending" as const };
const approvedTrial = { status: "Trial" as const, approval_status: "approved" as const };
const approvedActive = { status: "Active" as const, approval_status: "approved" as const };
const approvedSuspended = { status: "Suspended" as const, approval_status: "approved" as const };
const rejected = { status: "Trial" as const, approval_status: "rejected" as const };
const legacy = { status: "Active" as const };

assert.equal(resolveCompanyApprovalStatus(legacy), "approved");
assert.equal(matchesCompanyWorkspaceTab(pending, "pending"), true);
assert.equal(matchesCompanyWorkspaceTab(pending, "trial"), false);
assert.equal(matchesCompanyWorkspaceTab(pending, "active"), false);
assert.equal(matchesCompanyWorkspaceTab(approvedTrial, "trial"), true);
assert.equal(matchesCompanyWorkspaceTab(approvedTrial, "pending"), false);
assert.equal(matchesCompanyWorkspaceTab(approvedActive, "active"), true);
assert.equal(matchesCompanyWorkspaceTab(approvedSuspended, "suspended"), true);
assert.equal(matchesCompanyWorkspaceTab(rejected, "all"), true);
assert.equal(matchesCompanyWorkspaceTab(rejected, "pending"), false);
assert.equal(matchesCompanyWorkspaceTab(rejected, "trial"), false);

const counts = countCompaniesByWorkspaceTab([
  pending,
  approvedTrial,
  approvedActive,
  approvedSuspended,
  rejected,
  legacy,
]);
assert.equal(counts.pending, 1);
assert.equal(counts.trial, 1);
assert.equal(counts.active, 2);
assert.equal(counts.suspended, 1);
assert.equal(counts.all, 6);

console.log("  ✓ pending excluded from Active/Trial");
console.log("  ✓ rejected visible in All only (not Active/Trial/Pending)");
console.log("  ✓ legacy missing approval_status treated as approved\n");
