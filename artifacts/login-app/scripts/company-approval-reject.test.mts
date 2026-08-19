/**
 * Company rejection flow unit tests.
 * Run: node --experimental-strip-types artifacts/login-app/scripts/company-approval-reject.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyRejectCompanyError,
  parseRejectCompanyResponse,
  rejectCompanyErrorI18nKey,
} from "../src/lib/companies/reject-company-flow.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const hook = readFileSync(
  join(root, "artifacts/login-app/src/hooks/companies/use-company-approval.ts"),
  "utf8",
);
const workspace = readFileSync(
  join(root, "artifacts/login-app/src/components/companies/approval/company-approval-workspace.tsx"),
  "utf8",
);
const en = JSON.parse(
  readFileSync(join(root, "artifacts/login-app/src/locales/en/common.json"), "utf8"),
);
const ar = JSON.parse(
  readFileSync(join(root, "artifacts/login-app/src/locales/ar/common.json"), "utf8"),
);

console.log("\nCompany rejection flow\n");

assert.equal(classifyRejectCompanyError("rejection_reason_required"), "reasonRequired");
assert.equal(classifyRejectCompanyError("cannot_reject_approved_company"), "cannotRejectApproved");
assert.equal(
  classifyRejectCompanyError("Insufficient permissions to reject company"),
  "forbidden",
);
assert.equal(classifyRejectCompanyError("company_not_found"), "companyNotFound");
assert.equal(rejectCompanyErrorI18nKey("reasonRequired"), "companies.approval.errors.reasonRequired");

const rejectedCompany = parseRejectCompanyResponse({
  company: { id: "c1", approval_status: "rejected", name: "Acme" },
});
assert.equal(rejectedCompany.id, "c1");
assert.equal(rejectedCompany.approval_status, "rejected");

assert.throws(() => parseRejectCompanyResponse({ company: { id: "c1", approval_status: "pending" } }));
assert.throws(() => parseRejectCompanyResponse(null));

assert.match(hook, /reject_company_v1/);
assert.doesNotMatch(hook, /approval_status\s*=\s*['"]rejected['"]/);
assert.match(workspace, /AlertDialog/);
assert.match(workspace, /openRejectConfirmation/);
assert.match(workspace, /handleRejectCompany/);
assert.doesNotMatch(workspace, /approval_status\s*=\s*['"]rejected['"]/);

const approvalEn = en.companies.approval;
const approvalAr = ar.companies.approval;
for (const key of [
  "reject",
  "reason",
  "reasonRequired",
  "confirmRejectTitle",
  "confirmRejectDescription",
  "rejectSuccess",
  "rejectFailed",
]) {
  assert.ok(approvalEn[key], `missing en.companies.approval.${key}`);
  assert.ok(approvalAr[key], `missing ar.companies.approval.${key}`);
}

for (const key of [
  "reasonRequired",
  "cannotRejectApproved",
  "forbidden",
  "companyNotFound",
  "invalidResponse",
  "unknown",
  "alreadyRejected",
]) {
  assert.ok(approvalEn.errors[key], `missing en error ${key}`);
  assert.ok(approvalAr.errors[key], `missing ar error ${key}`);
}

console.log("  ✓ RPC error classification");
console.log("  ✓ reject response parsing");
console.log("  ✓ hook uses reject_company_v1 (no direct status mutation)");
console.log("  ✓ workspace confirmation dialog wired");
console.log("  ✓ en/ar rejection strings present\n");
