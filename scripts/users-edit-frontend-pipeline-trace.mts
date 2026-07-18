/**
 * Frontend-only pipeline trace: RPC 200 → fetchAssignableRolesForCompany → users.tsx filters
 * Does not call Supabase; simulates exact mapper/filter logic from source files.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Representative raw RPC 200 body (no company_id in payload — matches migration 121)
const RAW_RPC_JSON = [
  { id: "cbb657ff-8034-4124-83f1-3c19c558dca0", name: "Admin", is_system: false },
  { id: "f5ec92f2-a65c-4b79-9b27-d2ee124b240c", name: "Employee", is_system: false },
  { id: "18218113-b3d8-4055-abdf-6c0ff26600ac", name: "Manager", is_system: false },
];

function fetchAssignableRolesForCompany(companyId: string, raw: typeof RAW_RPC_JSON) {
  return raw.map((row) => ({
    id: row.id,
    name: row.name,
    company_id: companyId,
    is_system: row.is_system ?? false,
  }));
}

function tracePipeline(label: string, editTargetCompanyId: string | null, fetchCompanyId: string | null, raw = RAW_RPC_JSON) {
  const reactQueryData =
    fetchCompanyId == null ? undefined : fetchAssignableRolesForCompany(fetchCompanyId, raw);
  const editRoles = reactQueryData ?? [];
  const editTenantRoles = editRoles.filter((role) => role.company_id === editTargetCompanyId);
  const editRoleSelectOptions = editRoles.map((role) => ({ value: role.id, label: role.name ?? "(no role)" }));
  const editCompanyHasNoRoles =
    Boolean(editTargetCompanyId) && editTenantRoles.length === 0;

  return {
    scenario: label,
    editTargetCompanyId,
    fetchCompanyIdUsedByHook: fetchCompanyId,
    steps: {
      "1_rawRpcJson": raw,
      "2_fetchAssignableRolesForCompany_result": reactQueryData ?? null,
      "3_reactQueryData": reactQueryData ?? null,
      "4_editRoles": editRoles,
      "5_editTenantRoles": editTenantRoles,
      "6_editRoleSelectOptions": editRoleSelectOptions,
    },
    rpcContainsCompanyId: raw.every((r) => "company_id" in r && r.company_id != null),
    mappedContainsCompanyId:
      reactQueryData?.every((r) => r.company_id === fetchCompanyId) ?? false,
    editCompanyHasNoRoles,
    rolesDiscardedAt: "users.tsx line 131: editRoles.filter((role) => role.company_id === editTargetCompanyId)",
    discardedCount: editRoles.length - editTenantRoles.length,
  };
}

// Scenario A: normal path — fetch companyId matches editTargetCompanyId (intended)
const normal = tracePipeline(
  "A fetch companyId === editTargetCompanyId (intended happy path)",
  "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
  "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
);

// Scenario B: stale React Query cache — data fetched for company A, editTargetCompanyId now B
const staleMismatch = tracePipeline(
  "B stale cache: editRoles stamped with company A, editTargetCompanyId is B",
  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
);

// Scenario C: raw RPC objects used as editRoles without mapper (legacy direct RPC/cache shape)
const rawWithoutMapper = tracePipeline(
  "C editRoles = raw RPC rows (no company_id stamp)",
  "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
  "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
  RAW_RPC_JSON.map((r) => ({ ...r })) as typeof RAW_RPC_JSON,
);
// Override step 4-6 for scenario C manually
staleMismatch; // keep linter happy
const scenarioC = {
  scenario: "C editRoles incorrectly set to raw RPC (missing company_id on objects)",
  editTargetCompanyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
  steps: {
    "1_rawRpcJson": RAW_RPC_JSON,
    "2_fetchAssignableRolesForCompany_result": "(skipped — raw assigned directly to editRoles)",
    "3_reactQueryData": RAW_RPC_JSON,
    "4_editRoles": RAW_RPC_JSON,
    "5_editTenantRoles": RAW_RPC_JSON.filter(
      (role) => (role as { company_id?: string }).company_id === "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
    ),
    "6_editRoleSelectOptions": RAW_RPC_JSON.map((r) => ({ value: r.id, label: r.name })),
  },
  rpcContainsCompanyId: false,
  discardedCount: RAW_RPC_JSON.length,
  rolesDiscardedAt: "users.tsx line 131",
};
scenarioC.steps["5_editTenantRoles"];
scenarioC.steps["6_editRoleSelectOptions"];

// Scenario D: super admin — editForm.companyId null → editTargetCompanyId null, separate mismatch
const superAdminNullForm = tracePipeline(
  "D super admin editForm.companyId null → hook disabled, editRoles default []",
  null,
  null,
);

console.log(
  JSON.stringify(
    {
      finding: {
        rawRpcIncludesCompanyId: false,
        fetchAddsCompanyIdAt: "fetch-assignable-roles.ts line 28: company_id: companyId",
        filterDiscardsAt: "users.tsx lines 130-132 editTenantRoles useMemo filter",
        editCompanyHasNoRolesUses: "editTenantRoles.length (line 137), NOT editRoles.length",
        editRoleSelectOptionsUses: "editRoles directly (lines 222-229), NOT editTenantRoles",
      },
      scenarios: [normal, staleMismatch, scenarioC, superAdminNullForm],
    },
    null,
    2,
  ),
);
