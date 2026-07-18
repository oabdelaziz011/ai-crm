/**
 * Read-only execution trace for Edit User role dropdown pipeline.
 * Mirrors users.tsx → useCompanyAssignableRoles → fetchAssignableRolesForCompany.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const TENANT = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

function loadEnv() {
  const env: Record<string, string> = {};
  for (const p of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

type TraceRow = Record<string, unknown>;

function resolveCompanyId(
  formCompanyId: string | null,
  canPickCompany: boolean,
  authCompanyId: string | null,
): string | null {
  return canPickCompany ? formCompanyId : (authCompanyId ?? null);
}

function computeDerived(editRoles: Array<{ id: string; name?: string | null; company_id?: string | null }>, editTargetCompanyId: string | null, editRolesLoading: boolean) {
  const editTenantRoles = editRoles.filter((role) => role.company_id === editTargetCompanyId);
  const editCompanyHasNoRoles =
    Boolean(editTargetCompanyId) && !editRolesLoading && editTenantRoles.length === 0;
  const editRoleSelectOptions = editRoles.map((role) => ({
    value: role.id,
    label: role.name ?? "(no role)",
  }));
  return { editTenantRoles, editCompanyHasNoRoles, editRoleSelectOptions };
}

async function fetchAssignableRolesForCompany(
  client: ReturnType<typeof createClient>,
  companyId: string,
): Promise<{ httpStatus: number; rpcCalled: boolean; payload: unknown; body: unknown; error: string | null; mapped: Array<{ id: string; name: string | null; company_id: string; is_system: boolean }> }> {
  const url = `${loadEnv().VITE_SUPABASE_URL || loadEnv().SUPABASE_URL}/rest/v1/rpc/get_assignable_roles`;
  const key = loadEnv().VITE_SUPABASE_PUBLISHABLE_KEY || loadEnv().SUPABASE_PUBLISHABLE_KEY;
  const session = await client.auth.getSession();
  const token = session.data.session?.access_token;
  const payload = { p_company_id: companyId };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: key!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  const rpcError =
    !response.ok
      ? typeof body === "object" && body && "message" in body
        ? String((body as { message: string }).message)
        : `HTTP ${response.status}`
      : null;

  const mapped = Array.isArray(body)
    ? body.map((row: { id: string; name: string | null; is_system?: boolean | null }) => ({
        id: row.id,
        name: row.name,
        company_id: companyId,
        is_system: row.is_system ?? false,
      }))
    : [];

  return {
    httpStatus: response.status,
    rpcCalled: true,
    payload,
    body,
    error: rpcError,
    mapped,
  };
}

async function traceActor(actorEmail: string, targetUserEmail: string, password = "DemoVault2026!") {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  const client = createClient(url!, key!, { auth: { persistSession: false } });

  const signIn = await client.auth.signInWithPassword({ email: actorEmail, password });
  if (signIn.error) {
    return { actorEmail, targetUserEmail, error: `login failed: ${signIn.error.message}` };
  }

  const actorId = signIn.data.user.id;
  const { data: actorProfile } = await client
    .from("profiles")
    .select("company_id,is_super_admin,email")
    .eq("id", actorId)
    .maybeSingle();

  const { data: targetProfile } = await client
    .from("profiles")
    .select("id,email,company_id,full_name")
    .eq("email", targetUserEmail)
    .maybeSingle();

  const usersEdit = (await client.rpc("user_has_permission", { p_code: "users.edit" })).data;
  const usersView = (await client.rpc("user_has_permission", { p_code: "users.view" })).data;
  const rolesView = (await client.rpc("user_has_permission", { p_code: "roles.view" })).data;

  const isSuperAdmin = actorProfile?.is_super_admin === true;
  const canPickCompany = isSuperAdmin; // simplified: canViewCompanies also needed but super admin dominates here
  const authCompanyId = actorProfile?.company_id ?? null;

  const steps: TraceRow[] = [];

  // Step A: openEditDialog (state writes)
  const editFormCompanyId = targetProfile?.company_id ?? null;
  steps.push({
    step: "A openEditDialog()",
    companyId: editFormCompanyId,
    rpcCalled: "no",
    requestPayload: null,
    httpStatus: null,
    rpcResponseBody: null,
    reactQueryData: null,
    editRoles: null,
    editTenantRoles: null,
    editCompanyHasNoRoles: null,
    editRoleSelectOptions: null,
    notes: "setEditForm({ companyId: user.company_id, ... }); setEditOpen(true)",
  });

  // Step B: editTargetCompanyId derived
  const editTargetCompanyId = resolveCompanyId(editFormCompanyId, canPickCompany, authCompanyId);
  steps.push({
    step: "B editTargetCompanyId = resolveCompanyId(editForm.companyId)",
    companyId: editTargetCompanyId,
    rpcCalled: "no",
    requestPayload: null,
    httpStatus: null,
    rpcResponseBody: null,
    reactQueryData: null,
    editRoles: null,
    editTenantRoles: null,
    editCompanyHasNoRoles: null,
    editRoleSelectOptions: null,
    notes: `canPickCompany=${canPickCompany}, editForm.companyId=${editFormCompanyId}, auth.company.id=${authCompanyId}`,
  });

  // Step C: useCompanyAssignableRoles enabled gate
  const editOpen = true;
  const hookEnabled = editOpen && Boolean(editTargetCompanyId);
  steps.push({
    step: "C useCompanyAssignableRoles(editTargetCompanyId, editOpen)",
    companyId: editTargetCompanyId,
    rpcCalled: hookEnabled ? "pending" : "no",
    requestPayload: hookEnabled ? { p_company_id: editTargetCompanyId } : null,
    httpStatus: null,
    rpcResponseBody: null,
    reactQueryData: null,
    editRoles: hookEnabled ? undefined : [],
    editTenantRoles: hookEnabled ? undefined : [],
    editCompanyHasNoRoles: hookEnabled ? undefined : Boolean(editTargetCompanyId) && editTargetCompanyId !== null && [].length === 0,
    editRoleSelectOptions: hookEnabled ? undefined : [],
    notes: `enabled=${hookEnabled} (editOpen && Boolean(companyId))`,
  });

  if (!hookEnabled || !editTargetCompanyId) {
    const editRoles: never[] = [];
    const derived = computeDerived(editRoles, editTargetCompanyId, false);
    steps.push({
      step: "D-H pipeline short-circuited (hook disabled)",
      companyId: editTargetCompanyId,
      rpcCalled: "no",
      requestPayload: null,
      httpStatus: null,
      rpcResponseBody: null,
      reactQueryData: [],
      editRoles,
      editTenantRoles: derived.editTenantRoles,
      editCompanyHasNoRoles: derived.editCompanyHasNoRoles,
      editRoleSelectOptions: derived.editRoleSelectOptions,
      notes: "React Query never runs queryFn; editRoles stays default []",
    });
    return { actorEmail, targetUserEmail, actor: { isSuperAdmin, usersEdit, usersView, rolesView, authCompanyId }, steps };
  }

  // Step D: fetchAssignableRolesForCompany
  const fetchResult = await fetchAssignableRolesForCompany(client, editTargetCompanyId);
  steps.push({
    step: "D fetchAssignableRolesForCompany() → supabase.rpc(get_assignable_roles)",
    companyId: editTargetCompanyId,
    rpcCalled: "yes",
    requestPayload: fetchResult.payload,
    httpStatus: fetchResult.httpStatus,
    rpcResponseBody: fetchResult.body,
    reactQueryData: null,
    editRoles: null,
    editTenantRoles: null,
    editCompanyHasNoRoles: null,
    editRoleSelectOptions: null,
    notes: fetchResult.error ? `RPC/HTTP error: ${fetchResult.error}` : "RPC success",
  });

  // Step E: React Query outcome
  let reactQueryData: typeof fetchResult.mapped | undefined;
  let editRolesLoading = false;
  let queryError: string | null = null;

  let editRoles: typeof fetchResult.mapped;
  if (fetchResult.error) {
    queryError = fetchResult.error;
    reactQueryData = undefined;
    editRoles = [];
  } else {
    reactQueryData = fetchResult.mapped;
    editRoles = fetchResult.mapped;
  }

  steps.push({
    step: "E React Query useCompanyAssignableRoles result",
    companyId: editTargetCompanyId,
    rpcCalled: "yes",
    requestPayload: fetchResult.payload,
    httpStatus: fetchResult.httpStatus,
    rpcResponseBody: fetchResult.body,
    reactQueryData: reactQueryData ?? null,
    editRoles: queryError ? [] : editRoles,
    editTenantRoles: null,
    editCompanyHasNoRoles: null,
    editRoleSelectOptions: null,
    notes: queryError
      ? `queryFn threw → isError=true, data=undefined, default editRoles=[]`
      : "queryFn resolved → data=mapped RPC rows",
  });

  // Step F: editRoles binding
  steps.push({
    step: "F editRoles = data ?? []",
    companyId: editTargetCompanyId,
    rpcCalled: "yes",
    requestPayload: fetchResult.payload,
    httpStatus: fetchResult.httpStatus,
    rpcResponseBody: fetchResult.body,
    reactQueryData: reactQueryData ?? null,
    editRoles,
    editTenantRoles: null,
    editCompanyHasNoRoles: null,
    editRoleSelectOptions: null,
    notes: `editRoles.length=${editRoles.length}`,
  });

  const derived = computeDerived(editRoles, editTargetCompanyId, editRolesLoading);

  // Step G: editTenantRoles filter
  steps.push({
    step: "G editTenantRoles = editRoles.filter(role => role.company_id === editTargetCompanyId)",
    companyId: editTargetCompanyId,
    rpcCalled: "yes",
    requestPayload: fetchResult.payload,
    httpStatus: fetchResult.httpStatus,
    rpcResponseBody: fetchResult.body,
    reactQueryData: reactQueryData ?? null,
    editRoles,
    editTenantRoles: derived.editTenantRoles,
    editCompanyHasNoRoles: null,
    editRoleSelectOptions: null,
    notes: `filtered ${editRoles.length} → ${derived.editTenantRoles.length}`,
  });

  // Step H: editCompanyHasNoRoles + editRoleSelectOptions
  steps.push({
    step: "H editCompanyHasNoRoles + editRoleSelectOptions",
    companyId: editTargetCompanyId,
    rpcCalled: "yes",
    requestPayload: fetchResult.payload,
    httpStatus: fetchResult.httpStatus,
    rpcResponseBody: fetchResult.body,
    reactQueryData: reactQueryData ?? null,
    editRoles,
    editTenantRoles: derived.editTenantRoles,
    editCompanyHasNoRoles: derived.editCompanyHasNoRoles,
    editRoleSelectOptions: derived.editRoleSelectOptions,
    notes: derived.editCompanyHasNoRoles
      ? "UI shows users.errors.company_has_no_roles"
      : "UI renders SearchableSelect options",
  });

  // Step I: UI rendering gate
  steps.push({
    step: "I UI rendering (users.tsx lines 803-822)",
    companyId: editTargetCompanyId,
    rpcCalled: "yes",
    requestPayload: fetchResult.payload,
    httpStatus: fetchResult.httpStatus,
    rpcResponseBody: fetchResult.body,
    reactQueryData: reactQueryData ?? null,
    editRoles,
    editTenantRoles: derived.editTenantRoles,
    editCompanyHasNoRoles: derived.editCompanyHasNoRoles,
    editRoleSelectOptions: derived.editRoleSelectOptions,
    notes: derived.editCompanyHasNoRoles
      ? "{editCompanyHasNoRoles && <p>company_has_no_roles</p>}"
      : "SearchableSelect enabled with options",
  });

  const firstEmptyStep = steps.find((s) => {
    if (Array.isArray(s.editRoles) && s.editRoles.length === 0 && s.step.startsWith("F")) return true;
    if (Array.isArray(s.editTenantRoles) && s.editTenantRoles.length === 0 && s.step.startsWith("G")) return true;
    return false;
  });

  return {
    actorEmail,
    targetUserEmail,
    actor: { isSuperAdmin, usersEdit, usersView, rolesView, authCompanyId, canPickCompany },
    firstEmptyAt: firstEmptyStep?.step ?? null,
    emptyOrigin: queryError
      ? "React Query (queryFn throw → default editRoles=[])"
      : !hookEnabled
        ? "Hook (enabled=false → query never runs)"
        : editRoles.length === 0
          ? "RPC (empty body)"
          : derived.editTenantRoles.length === 0
            ? "Filtering (editTenantRoles filter)"
            : "not empty",
    steps,
  };
}

async function main() {
  const scenarios = await Promise.all([
    traceActor("demo-platform@vaultos.local", "hhhfff@yahoo.com"),
    traceActor("demo-beta-admin@vaultos.local", "demo-employee@vaultos.local"),
  ]);

  // Simulate company admin without users.edit (oma cannot login — mirror permissions via platform read + synthetic trace)
  console.log(JSON.stringify({ scenarios }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
