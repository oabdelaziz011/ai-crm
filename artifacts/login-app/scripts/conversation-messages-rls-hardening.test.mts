/**
 * Omnichannel Phase 2A — conversation_messages RLS RBAC hardening (migration 346).
 *
 * Run:
 *   node --experimental-strip-types --test artifacts/login-app/scripts/conversation-messages-rls-hardening.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");

const migration011 = readFileSync(
  resolve(projectRoot, "supabase/migrations/011_conversation_core.sql"),
  "utf8",
);
const migration113 = readFileSync(
  resolve(projectRoot, "supabase/migrations/113_rbac_rls_completion.sql"),
  "utf8",
);
const migration301 = readFileSync(
  resolve(projectRoot, "supabase/migrations/301_rls_company_feature_enforcement.sql"),
  "utf8",
);
const migration346 = readFileSync(
  resolve(projectRoot, "supabase/migrations/346_conversation_messages_rbac_hardening.sql"),
  "utf8",
);
const messageService = readFileSync(
  resolve(projectRoot, "lib/ai-conversation/src/services/message-service.ts"),
  "utf8",
);
const conversationConstants = readFileSync(
  resolve(projectRoot, "lib/ai-conversation/src/constants.ts"),
  "utf8",
);
const webhookPlatform = readFileSync(
  resolve(projectRoot, "artifacts/api-server/src/platform/create-webhook-platform.ts"),
  "utf8",
);

const VIEW = "ai.conversations.view";
const REPLY = "ai.conversations.reply";

/** Mirrors company_has_permission gate used by conversations + messages RLS. */
function companyHasPermission(input: {
  authRole: "authenticated" | "service_role" | "anon";
  isSuperAdmin: boolean;
  currentCompanyId: string | null;
  permissionCompanyId: string;
  permissions: ReadonlySet<string>;
  permissionAvailable: boolean;
  permission: string;
}): boolean {
  if (input.authRole !== "authenticated") return false;
  if (input.isSuperAdmin) return true;
  return (
    input.permissionCompanyId != null
    && input.permissionCompanyId === input.currentCompanyId
    && input.permissions.has(input.permission)
    && input.permissionAvailable
  );
}

/** Phase 2A message policy model (exists conversation + company_has_permission). */
function messageSelectAllowed(input: {
  authRole: "authenticated" | "service_role" | "anon";
  bypassRls: boolean;
  isSuperAdmin: boolean;
  currentCompanyId: string | null;
  conversationCompanyId: string;
  conversationDeleted: boolean;
  permissions: ReadonlySet<string>;
  permissionAvailable: boolean;
}): boolean {
  if (input.bypassRls) return true;
  if (input.conversationDeleted) return false;
  return companyHasPermission({
    authRole: input.authRole,
    isSuperAdmin: input.isSuperAdmin,
    currentCompanyId: input.currentCompanyId,
    permissionCompanyId: input.conversationCompanyId,
    permissions: input.permissions,
    permissionAvailable: input.permissionAvailable,
    permission: VIEW,
  });
}

function messageInsertAllowed(input: {
  authRole: "authenticated" | "service_role" | "anon";
  bypassRls: boolean;
  isSuperAdmin: boolean;
  currentCompanyId: string | null;
  conversationCompanyId: string;
  conversationDeleted: boolean;
  permissions: ReadonlySet<string>;
  permissionAvailable: boolean;
}): boolean {
  if (input.bypassRls) return true;
  if (input.conversationDeleted) return false;
  return companyHasPermission({
    authRole: input.authRole,
    isSuperAdmin: input.isSuperAdmin,
    currentCompanyId: input.currentCompanyId,
    permissionCompanyId: input.conversationCompanyId,
    permissions: input.permissions,
    permissionAvailable: input.permissionAvailable,
    permission: REPLY,
  });
}

/** Pre-346 bypass: company membership only. */
function legacyMessageAccessAllowed(input: {
  authRole: "authenticated" | "service_role" | "anon";
  bypassRls: boolean;
  isSuperAdmin: boolean;
  currentCompanyId: string | null;
  conversationCompanyId: string;
  conversationDeleted: boolean;
}): boolean {
  if (input.bypassRls) return true;
  if (input.authRole !== "authenticated") return false;
  if (input.conversationDeleted) return false;
  if (input.isSuperAdmin) return true;
  return input.conversationCompanyId === input.currentCompanyId;
}

describe("Phase 2A — migration 346 source contract", () => {
  it("rewrites SELECT to require ai.conversations.view via company_has_permission", () => {
    assert.match(migration346, /conversation_messages_select/);
    assert.match(migration346, /ai\.conversations\.view/);
    assert.match(migration346, /company_has_permission\(c\.company_id,\s*'ai\.conversations\.view'\)/);
  });

  it("rewrites INSERT to require ai.conversations.reply via company_has_permission", () => {
    assert.match(migration346, /conversation_messages_insert/);
    assert.match(migration346, /ai\.conversations\.reply/);
    assert.match(migration346, /company_has_permission\(c\.company_id,\s*'ai\.conversations\.reply'\)/);
  });

  it("does not introduce conversation.view/reply into message RLS (no silent broaden)", () => {
    assert.doesNotMatch(migration346, /'conversation\.view'/);
    assert.doesNotMatch(migration346, /'conversation\.reply'/);
  });

  it("does not invent new permission codes", () => {
    assert.doesNotMatch(migration346, /ai\.conversations\.(manage|delete|admin)/);
    assert.equal(
      (migration346.match(/ai\.conversations\.(view|reply)/g) ?? []).length >= 2,
      true,
    );
  });

  it("scopes via conversations ownership (deleted_at null + company_id)", () => {
    assert.match(migration346, /from public\.conversations c/);
    assert.match(migration346, /c\.deleted_at is null/);
    assert.match(migration346, /c\.id = conversation_id/);
  });

  it("does not modify UPDATE/DELETE deny policies or unrelated tables", () => {
    const sqlBody = migration346
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(sqlBody, /conversation_messages_update/);
    assert.doesNotMatch(sqlBody, /conversation_messages_delete/);
    assert.doesNotMatch(sqlBody, /on public\.conversations\b/);
    assert.doesNotMatch(sqlBody, /conversation_participants/);
    assert.doesNotMatch(sqlBody, /conversation-attachments/);
    assert.doesNotMatch(sqlBody, /\brealtime\b/i);
  });

  it("does not add a new SECURITY DEFINER helper or super-admin shortcut in 346", () => {
    assert.doesNotMatch(migration346, /security definer/i);
    assert.doesNotMatch(migration346, /is_super_admin\s*\(/);
    assert.doesNotMatch(migration346, /hasPermission:\s*\(\)\s*=>\s*true/);
    assert.doesNotMatch(migration346, /SYSTEM_CONTEXT/);
  });
});

describe("Phase 2A — taxonomy alignment", () => {
  it("conversations RLS (113) already uses ai.conversations.view/reply", () => {
    assert.match(migration113, /company_has_permission\(company_id, 'ai\.conversations\.view'\)/);
    assert.match(migration113, /company_has_permission\(company_id, 'ai\.conversations\.reply'\)/);
  });

  it("MessageService uses the same authoritative codes", () => {
    assert.match(conversationConstants, /view:\s*"ai\.conversations\.view"/);
    assert.match(conversationConstants, /reply:\s*"ai\.conversations\.reply"/);
    assert.match(messageService, /assertPermission\(ctx, CONVERSATION_PERMISSIONS\.reply\)/);
    assert.match(messageService, /assertPermission\(ctx, CONVERSATION_PERMISSIONS\.view\)/);
  });

  it("legacy 011 message policies were company-membership-only (the bypass)", () => {
    assert.match(migration011, /conversation_messages_select/);
    assert.match(
      migration011,
      /conversation_messages_select[\s\S]*?conversation_belongs_to_current_company\(conversation_id\)/,
    );
    const selectBlock = migration011.slice(
      migration011.indexOf("create policy conversation_messages_select"),
      migration011.indexOf("create policy conversation_messages_insert"),
    );
    assert.doesNotMatch(selectBlock, /ai\.conversations\.view/);
    assert.doesNotMatch(selectBlock, /company_has_permission/);
  });

  it("company_has_permission remains authenticated-scoped with intentional SA short-circuit", () => {
    assert.match(migration301, /auth\.role\(\) = 'authenticated'/);
    assert.match(migration301, /public\.is_super_admin\(\)/);
    assert.match(migration301, /p_company_id = public\.current_company_id\(\)/);
  });
});

describe("Phase 2A — authorization matrix (PostgREST model)", () => {
  const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  it("1. Company A member with view can read Company A messages", () => {
    assert.equal(
      messageSelectAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyA,
        conversationDeleted: false,
        permissions: new Set([VIEW]),
        permissionAvailable: true,
      }),
      true,
    );
  });

  it("2. Company A member without view cannot read", () => {
    assert.equal(
      messageSelectAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyA,
        conversationDeleted: false,
        permissions: new Set([REPLY]),
        permissionAvailable: true,
      }),
      false,
    );
    // Legacy path WOULD have allowed this — proves the bypass closed.
    assert.equal(
      legacyMessageAccessAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyA,
        conversationDeleted: false,
      }),
      true,
    );
  });

  it("3. Company A member with reply can insert", () => {
    assert.equal(
      messageInsertAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyA,
        conversationDeleted: false,
        permissions: new Set([REPLY]),
        permissionAvailable: true,
      }),
      true,
    );
  });

  it("4. Company A member without reply cannot insert", () => {
    assert.equal(
      messageInsertAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyA,
        conversationDeleted: false,
        permissions: new Set([VIEW]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("5. Company A cannot read Company B messages", () => {
    assert.equal(
      messageSelectAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyB,
        conversationDeleted: false,
        permissions: new Set([VIEW, REPLY]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("6. Company A cannot insert into Company B conversation", () => {
    assert.equal(
      messageInsertAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyB,
        conversationDeleted: false,
        permissions: new Set([VIEW, REPLY]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("7. service_role inbound/webhook path remains functional (RLS bypass)", () => {
    assert.equal(
      messageInsertAllowed({
        authRole: "service_role",
        bypassRls: true,
        isSuperAdmin: false,
        currentCompanyId: null,
        conversationCompanyId: companyA,
        conversationDeleted: false,
        permissions: new Set(),
        permissionAvailable: false,
      }),
      true,
    );
    assert.equal(
      messageSelectAllowed({
        authRole: "service_role",
        bypassRls: true,
        isSuperAdmin: false,
        currentCompanyId: null,
        conversationCompanyId: companyA,
        conversationDeleted: false,
        permissions: new Set(),
        permissionAvailable: false,
      }),
      true,
    );
  });

  it("8. conversation.view alone does not grant message SELECT (no broaden)", () => {
    assert.equal(
      messageSelectAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyA,
        conversationDeleted: false,
        permissions: new Set(["conversation.view", "conversation.reply"]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("9. Super-admin is intentional via company_has_permission (same as conversations)", () => {
    assert.equal(
      messageSelectAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: true,
        currentCompanyId: companyA,
        conversationCompanyId: companyB,
        conversationDeleted: false,
        permissions: new Set(),
        permissionAvailable: false,
      }),
      true,
    );
    // Not a generic unauthenticated bypass
    assert.equal(
      messageSelectAllowed({
        authRole: "anon",
        bypassRls: false,
        isSuperAdmin: true,
        currentCompanyId: null,
        conversationCompanyId: companyA,
        conversationDeleted: false,
        permissions: new Set(),
        permissionAvailable: false,
      }),
      false,
    );
  });

  it("10. Deleted conversation blocks message access", () => {
    assert.equal(
      messageSelectAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyA,
        conversationDeleted: true,
        permissions: new Set([VIEW, REPLY]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("11. Missing commercial feature availability denies (permission_available false)", () => {
    assert.equal(
      messageSelectAllowed({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        conversationCompanyId: companyA,
        conversationDeleted: false,
        permissions: new Set([VIEW]),
        permissionAvailable: false,
      }),
      false,
    );
  });
});

describe("Phase 2A — MessageService + webhook wiring remain compatible", () => {
  it("MessageService still gates reply before write and view before read", () => {
    assert.match(messageService, /async addMessage[\s\S]*?assertPermission\(ctx, CONVERSATION_PERMISSIONS\.reply\)/);
    assert.match(messageService, /async listMessages[\s\S]*?assertPermission\(ctx, CONVERSATION_PERMISSIONS\.view\)/);
  });

  it("webhook platform uses service-role Supabase client (RLS bypass for inbound)", () => {
    assert.match(webhookPlatform, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(webhookPlatform, /createSupabaseServiceClient|createClient\(url, key/);
  });

  it("internal notes share conversation_messages table (same INSERT policy = reply)", () => {
    // MessageService does not special-case internal_note permissions — reply covers all inserts.
    assert.match(messageService, /assertPermission\(ctx, CONVERSATION_PERMISSIONS\.reply\)/);
    assert.doesNotMatch(messageService, /internal_note[\s\S]{0,80}assertPermission/);
  });
});
