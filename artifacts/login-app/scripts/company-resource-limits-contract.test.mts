/**
 * Guard: occupancy limits are frozen per company, not monthly usage.
 * Run: npx --yes tsx --test artifacts/login-app/scripts/company-resource-limits-contract.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const migration = readFileSync(join(root, "supabase/migrations/307_company_resource_limits.sql"), "utf8");
const migration308 = readFileSync(join(root, "supabase/migrations/308_resource_limits_hardening.sql"), "utf8");
const provision = readFileSync(join(root, "supabase/functions/provision-user/index.ts"), "utf8");
const usersPage = readFileSync(join(root, "artifacts/login-app/src/pages/users.tsx"), "utf8");
const branchesPage = readFileSync(
  join(root, "artifacts/login-app/src/pages/dashboard/settings/company/branches-list-page.tsx"),
  "utf8",
);
const approval = readFileSync(
  join(root, "artifacts/login-app/src/components/companies/approval/company-approval-workspace.tsx"),
  "utf8",
);
const subscriptionTab = readFileSync(
  join(root, "artifacts/login-app/src/components/company-workspace/tabs/company-subscription-tab.tsx"),
  "utf8",
);
const overviewTab = readFileSync(
  join(root, "artifacts/login-app/src/components/company-workspace/tabs/company-overview-tab.tsx"),
  "utf8",
);
const planPanel = readFileSync(
  join(root, "artifacts/login-app/src/components/billing/panels/plan-experience-panel.tsx"),
  "utf8",
);

assert.match(migration, /company_resource_limits/);
assert.match(migration, /max_users/);
assert.match(migration, /max_branches/);
assert.match(migration, /'package', 'trial', 'contract', 'manual', 'system'/);
assert.match(migration, /reserve_company_user_seat_v1/);
assert.match(migration, /release_company_user_seat_v1/);
assert.match(migration, /get_company_resource_occupancy_v1/);
assert.match(migration, /set_company_resource_limits_v1/);
assert.match(migration, /is_super_admin\(\)/);
assert.match(migration, /trg_enforce_company_user_occupancy/);
assert.match(migration, /trg_enforce_company_branch_occupancy/);
assert.match(migration, /trg_sync_company_resource_limits/);
assert.match(migration, /is_active = true/);
assert.match(migration, /is_super_admin, false\) = false/);
assert.match(migration, /deleted_at is null/);
assert.doesNotMatch(migration, /insert into public\.usage_records/);
assert.doesNotMatch(migration, /perform public\.ingest_usage_event/);
assert.doesNotMatch(migration, /from public\.company_usage_limit_overrides/);
assert.doesNotMatch(migration, /LicensingEngine/);
assert.doesNotMatch(migration, /drop table public\.plans/i);

assert.match(provision, /reserve_company_user_seat_v1/);
assert.match(provision, /release_company_user_seat_v1/);
assert.match(provision, /inviteUserByEmail/);
assert.match(provision, /deleteUser/);

assert.match(usersPage, /useCompanyResourceOccupancy/);
assert.match(usersPage, /formatResourceOccupancy/);
assert.match(branchesPage, /useCompanyResourceOccupancy/);
assert.match(approval, /resourceLimitsForPackageCode/);
assert.match(approval, /useSetCompanyResourceLimits/);
assert.match(subscriptionTab, /useCompanyResourceOccupancy/);
assert.doesNotMatch(approval, /ingest_usage_event/);
assert.match(migration308, /effective_used/);
assert.match(migration308, /user_has_permission_in_company/);
assert.match(migration308, /_ensure_company_resource_limits/);
assert.doesNotMatch(subscriptionTab, /bundle\?\.counts\.employees/);
assert.match(overviewTab, /useCompanyResourceOccupancy/);
assert.doesNotMatch(overviewTab, /seatsLimit = plan\?\.max_users/);
assert.match(planPanel, /useCompanyResourceOccupancy/);
assert.doesNotMatch(planPanel, /subscription\.plan\?\.max_users \?\? billingNotAvailable/);

console.log("company-resource-limits-contract.test.mts: ok");
