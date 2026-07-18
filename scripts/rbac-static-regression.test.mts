/**
 * RBAC static regression checks (no live DB required).
 * Run: tsx scripts/rbac-static-regression.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

const usersSource = read("artifacts/login-app/src/pages/users.tsx");
const aiAssistantSource = read("artifacts/login-app/src/pages/ai-assistant.tsx");
const dashboardRegistry = read("artifacts/login-app/src/config/dashboard-route-registry.ts");
const migration111 = read("supabase/migrations/111_rbac_enforcement.sql");
const provisionUser = read("supabase/functions/provision-user/index.ts");

assert.match(usersSource, /canViewUsers/, "Users page must gate on users.view");
assert.match(usersSource, /canManageUsers/, "Users page must gate mutations on users.edit");
assert.doesNotMatch(usersSource, /const \{ isSuperAdmin, hasPermission \} = useAuthUser\(\);\s*\n\s*const \{ isSuperAdmin, hasPermission \} = useAuthUser\(\)/, "Duplicate useAuthUser calls");

assert.doesNotMatch(aiAssistantSource, /isCompanyAdmin/, "AI Assistant must not use role-name checks");
assert.match(aiAssistantSource, /hasPermission\("ai_assistant\.view"\)/, "AI Assistant view permission");

assert.match(dashboardRegistry, /permission:\s*"companies\.view"/, "Companies route uses companies.view not superAdminOnly");
assert.match(dashboardRegistry, /permission:\s*"settings\.view"/, "Settings route permission");

assert.match(migration111, /user_has_permission\('audit_logs\.view'\)/, "Migration 111 audit_logs RLS");
assert.match(migration111, /user_has_permission\('users\.view'\)/, "Migration 111 profiles users.view");
assert.match(migration111, /user_has_permission\('roles\.create'\)/, "Migration 111 roles.create");

assert.match(provisionUser, /user_has_permission.*users\.edit/, "provision-user uses users.edit RPC");
assert.match(provisionUser, /validateProvisionRequest/, "provision-user validates tenant boundaries");
assert.match(provisionUser, /effectiveCompanyId/, "provision-user uses server-derived company id");

assert.match(usersSource, /canPickCompany/, "Users page must use companies.view for company picker");
assert.match(read("artifacts/login-app/src/lib/rbac/permission-aliases.ts"), /users\.create.*users\.edit/, "Permission aliases must map users.create");

console.log("[PASS] RBAC static regression checks");
