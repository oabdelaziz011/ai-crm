/**
 * Omnichannel Phase 2B — conversation-attachments storage RBAC (migration 347).
 *
 * Run:
 *   node --experimental-strip-types --test artifacts/login-app/scripts/conversation-attachments-storage-rbac.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");

const migration213 = readFileSync(
  resolve(projectRoot, "supabase/migrations/213_omnichannel_composer_attachments_storage.sql"),
  "utf8",
);
const migration347 = readFileSync(
  resolve(projectRoot, "supabase/migrations/347_conversation_attachments_storage_rbac.sql"),
  "utf8",
);
const attachmentService = readFileSync(
  resolve(projectRoot, "artifacts/login-app/src/lib/omnichannel/services/conversation-attachment-service.ts"),
  "utf8",
);
const migration301 = readFileSync(
  resolve(projectRoot, "supabase/migrations/301_rls_company_feature_enforcement.sql"),
  "utf8",
);

const VIEW = "ai.conversations.view";
const REPLY = "ai.conversations.reply";

type AuthRole = "authenticated" | "service_role" | "anon";

function companyHasPermission(input: {
  authRole: AuthRole;
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

/** Mirrors internal.can_access_conversation_attachment (migration 347). */
function canAccessConversationAttachment(input: {
  authRole: AuthRole;
  bypassRls: boolean;
  isSuperAdmin: boolean;
  currentCompanyId: string | null;
  objectName: string;
  permission: string;
  conversations: ReadonlyMap<string, { companyId: string; deleted: boolean }>;
  permissions: ReadonlySet<string>;
  permissionAvailable: boolean;
}): boolean {
  if (input.bypassRls) return true;
  if (input.authRole !== "authenticated") return false;
  if (input.permission !== VIEW && input.permission !== REPLY) return false;

  const parts = input.objectName.split("/").filter(Boolean);
  const pathCompanyId = parts[0] ?? null;
  const pathConversationId = parts[1] ?? null;
  if (!pathCompanyId || !pathConversationId) return false;

  const conversation = input.conversations.get(pathConversationId);
  if (!conversation || conversation.deleted) return false;
  if (conversation.companyId !== pathCompanyId) return false;

  return companyHasPermission({
    authRole: input.authRole,
    isSuperAdmin: input.isSuperAdmin,
    currentCompanyId: input.currentCompanyId,
    permissionCompanyId: conversation.companyId,
    permissions: input.permissions,
    permissionAvailable: input.permissionAvailable,
    permission: input.permission,
  });
}

/** Legacy 213: company folder only. */
function legacyCompanyFolderAccess(input: {
  authRole: AuthRole;
  bypassRls: boolean;
  currentCompanyId: string | null;
  objectName: string;
}): boolean {
  if (input.bypassRls) return true;
  if (input.authRole !== "authenticated") return false;
  const pathCompanyId = input.objectName.split("/")[0] ?? null;
  return pathCompanyId != null && pathCompanyId === input.currentCompanyId;
}

describe("Phase 2B — migration 347 source contract", () => {
  it("replaces company-folder-only policies with conversation ownership helper", () => {
    assert.match(migration347, /can_access_conversation_attachment/);
    assert.match(migration347, /conversation_attachments_select/);
    assert.match(migration347, /conversation_attachments_insert/);
    assert.match(migration347, /conversation_attachments_delete/);
    assert.match(migration347, /ai\.conversations\.view/);
    assert.match(migration347, /ai\.conversations\.reply/);
  });

  it("helper is SECURITY DEFINER with fixed search_path and no dynamic SQL", () => {
    assert.match(
      migration347,
      /create or replace function internal\.can_access_conversation_attachment[\s\S]*security definer[\s\S]*set search_path to internal, public/,
    );
    assert.doesNotMatch(migration347, /execute\s+format|execute\s+'/i);
  });

  it("does not accept conversation.* aliases or invent new permissions", () => {
    assert.doesNotMatch(migration347, /'conversation\.view'/);
    assert.doesNotMatch(migration347, /'conversation\.reply'/);
    assert.match(
      migration347,
      /p_permission not in \('ai\.conversations\.view', 'ai\.conversations\.reply'\)/,
    );
  });

  it("does not mutate objects/messages/data or change signed URL lifetime", () => {
    const sqlBody = migration347
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(sqlBody, /\bupdate\s+public\./i);
    assert.doesNotMatch(sqlBody, /\bdelete\s+from\s+public\./i);
    assert.doesNotMatch(sqlBody, /\binsert\s+into\s+public\./i);
    assert.doesNotMatch(sqlBody, /conversation_messages/);
    assert.doesNotMatch(sqlBody, /createSignedUrl|60 \* 60 \* 24 \* 7/i);
    assert.doesNotMatch(sqlBody, /\brealtime\b/i);
  });

  it("legacy 213 was company-folder-only (the H2 bypass)", () => {
    assert.match(migration213, /storage\.foldername\(name\)\)\[1\]/);
    assert.match(migration213, /select company_id::text from public\.profiles/);
    assert.doesNotMatch(migration213, /from public\.conversations/);
    assert.doesNotMatch(migration213, /ai\.conversations/);
  });

  it("does not introduce a generic is_super_admin shortcut in 347 itself", () => {
    // SA remains only via company_has_permission (301), not a new bypass in 347.
    assert.doesNotMatch(migration347, /is_super_admin\s*\(/);
    assert.match(migration301, /public\.is_super_admin\(\)/);
  });
});

describe("Phase 2B — attachment authorization matrix", () => {
  const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const convA1 = "11111111-1111-1111-1111-111111111111";
  const convA2 = "22222222-2222-2222-2222-222222222222";
  const convB1 = "33333333-3333-3333-3333-333333333333";

  const conversations = new Map([
    [convA1, { companyId: companyA, deleted: false }],
    [convA2, { companyId: companyA, deleted: false }],
    [convB1, { companyId: companyB, deleted: false }],
  ]);

  const pathA1 = `${companyA}/${convA1}/att-1-file.pdf`;
  const pathA2 = `${companyA}/${convA2}/att-2-file.pdf`;
  const pathB1 = `${companyB}/${convB1}/att-3-file.pdf`;
  const mismatched = `${companyA}/${convB1}/att-x-file.pdf`;
  const missingConv = `${companyA}/99999999-9999-9999-9999-999999999999/att.pdf`;

  it("1. Authorized user can READ own-company conversation attachment", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: pathA1,
        permission: VIEW,
        conversations,
        permissions: new Set([VIEW]),
        permissionAvailable: true,
      }),
      true,
    );
  });

  it("2. Same-company user WITHOUT view cannot READ known path (H2 closed)", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: pathA2,
        permission: VIEW,
        conversations,
        permissions: new Set(),
        permissionAvailable: true,
      }),
      false,
    );
    // Legacy company-folder policy WOULD allow this:
    assert.equal(
      legacyCompanyFolderAccess({
        authRole: "authenticated",
        bypassRls: false,
        currentCompanyId: companyA,
        objectName: pathA2,
      }),
      true,
    );
  });

  it("3. Authorized user can UPLOAD to owned conversation", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: pathA1,
        permission: REPLY,
        conversations,
        permissions: new Set([REPLY]),
        permissionAvailable: true,
      }),
      true,
    );
  });

  it("4. Unauthorized upload (no reply) DENY", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: pathA1,
        permission: REPLY,
        conversations,
        permissions: new Set([VIEW]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("5. DELETE requires reply on valid conversation", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: pathA1,
        permission: REPLY,
        conversations,
        permissions: new Set([REPLY]),
        permissionAvailable: true,
      }),
      true,
    );
  });

  it("6. DELETE without reply DENY even with known path", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: pathA2,
        permission: REPLY,
        conversations,
        permissions: new Set([VIEW]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("7. Cross-company READ DENY", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: pathB1,
        permission: VIEW,
        conversations,
        permissions: new Set([VIEW, REPLY]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("8. Cross-company UPLOAD DENY", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: pathB1,
        permission: REPLY,
        conversations,
        permissions: new Set([VIEW, REPLY]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("9. Known object path alone is NOT sufficient", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: pathA1,
        permission: VIEW,
        conversations,
        permissions: new Set(),
        permissionAvailable: false,
      }),
      false,
    );
  });

  it("10. Missing/invalid conversation DENY", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: missingConv,
        permission: VIEW,
        conversations,
        permissions: new Set([VIEW, REPLY]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("11. Path company/conversation mismatch DENY", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "authenticated",
        bypassRls: false,
        isSuperAdmin: false,
        currentCompanyId: companyA,
        objectName: mismatched,
        permission: REPLY,
        conversations,
        permissions: new Set([VIEW, REPLY]),
        permissionAvailable: true,
      }),
      false,
    );
  });

  it("12. Service-role inbound path still works (RLS bypass)", () => {
    assert.equal(
      canAccessConversationAttachment({
        authRole: "service_role",
        bypassRls: true,
        isSuperAdmin: false,
        currentCompanyId: null,
        objectName: pathA1,
        permission: REPLY,
        conversations,
        permissions: new Set(),
        permissionAvailable: false,
      }),
      true,
    );
  });
});

describe("Phase 2B — app upload target assert + H3 signed URL hardening", () => {
  it("upload path asserts conversation ownership before storage write", () => {
    assert.match(attachmentService, /assertConversationAttachmentUploadTarget/);
    assert.match(attachmentService, /\.from\("conversations"\)/);
    assert.match(attachmentService, /company_id/);
  });

  it("H3: storagePath is canonical; upload does not persist durable signed URLs", () => {
    assert.match(attachmentService, /storagePath is canonical/);
    assert.match(attachmentService, /attachmentUrl:\s*null/);
    assert.doesNotMatch(attachmentService, /createSignedUrl\(path,\s*60 \* 60 \* 24 \* 7\)/);
    assert.match(attachmentService, /resolveConversationAttachmentUrl/);
  });

  it("object naming scheme unchanged ({companyId}/{conversationId}/...)", () => {
    assert.match(
      attachmentService,
      new RegExp(String.raw`\$\{input\.companyId\.trim\(\)\}/\$\{input\.conversationId\.trim\(\)\}`),
    );
  });
});
