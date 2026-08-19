/**
 * Guard: frontend never sends authoritative money/company fields;
 * checkout API ignores client amount/currency/company_id.
 * Run: npx --yes tsx artifacts/login-app/scripts/saas-checkout-security.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const api = readFileSync(join(root, "artifacts/login-app/src/lib/billing/saas-checkout-api.ts"), "utf8");
const route = readFileSync(join(root, "artifacts/api-server/src/routes/billing-saas.ts"), "utf8");
const checkout = readFileSync(
  join(root, "artifacts/api-server/src/billing/saas/checkout-service.ts"),
  "utf8",
);
const panel = readFileSync(
  join(root, "artifacts/login-app/src/components/company-workspace/company-saas-payment-panel.tsx"),
  "utf8",
);
const overage = readFileSync(join(root, "artifacts/login-app/src/lib/billing/usage-overage.ts"), "utf8");

assert.match(api, /Intentionally omit amount\/currency\/companyId/);
assert.doesNotMatch(api, /body: JSON\.stringify\(\{[\s\S]*amount:/);

assert.match(route, /never used as settlement values/);
assert.match(route, /actorUserId: req\.supabaseUser\?\.id/);
assert.match(checkout, /p_actor_user_id/);
assert.doesNotMatch(checkout, /input\.amount/);

assert.match(panel, /paymentRequired/);
assert.match(panel, /notConfigured/);
assert.match(panel, /awaitingApproval/);
assert.match(panel, /expectedAmount: displayAmount/);
assert.doesNotMatch(panel, /expectedAmount: catalogAmount/);

assert.match(overage, /Does not invoice or settle/);
assert.match(overage, /chargeable/);

console.log("saas-checkout-security.test.mts: ok");
