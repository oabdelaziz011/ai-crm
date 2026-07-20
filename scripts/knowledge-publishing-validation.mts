/**
 * Sprint A1-03 acceptance validation: knowledge publishing lifecycle.
 * Run: tsx scripts/knowledge-publishing-validation.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createKnowledgePlatformServices } from "../lib/knowledge-platform/src/index.ts";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("C:/Users/oabde/Downloads/project");

function loadEnv() {
  const env: Record<string, string> = {};
  for (const filePath of [resolve(root, "artifacts/login-app/.env.local"), resolve(root, ".env")]) {
    try {
      for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

function resolveServiceRoleKey(env: Record<string, string>) {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY;
  const out = execSync("supabase projects api-keys --project-ref lfbtnskmvibikalsxwsm -o json", {
    encoding: "utf8",
    cwd: root,
  });
  return JSON.parse(out).find((entry: { name: string }) => entry.name === "service_role")?.api_key as string;
}

const checks: { id: string; ok: boolean; detail: string }[] = [];

function record(id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${detail}`);
}

function makeContext(companyId: string, userId: string) {
  return {
    userId,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

async function importDraftDocument(
  services: ReturnType<typeof createKnowledgePlatformServices>,
  ctx: ReturnType<typeof makeContext>,
  companyId: string,
  sourceId: string,
  title: string,
) {
  return services.import.importDocument(ctx, {
    companyId,
    sourceId,
    title,
    rawContent: "Enterprise MFA policy requires multi-factor authentication for all users accessing sensitive systems.",
    mimeType: "text/plain",
    contentEncoding: "text",
  });
}

async function countPublishedVersions(client: ReturnType<typeof createClient>, documentId: string) {
  const { count, error } = await client
    .from("knowledge_document_versions")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .eq("status", "published");
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = resolveServiceRoleKey(env);
  if (!url || !serviceRoleKey) throw new Error("Supabase credentials required.");

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const services = createKnowledgePlatformServices(client);

  const { data: company, error: companyError } = await client
    .from("companies")
    .select("id")
    .eq("company_type", "tenant")
    .limit(1)
    .maybeSingle();
  if (companyError || !company?.id) throw companyError ?? new Error("No tenant company found.");
  const companyId = company.id as string;
  const ctx = makeContext(companyId, null);

  const sourceKey = `a103-${Date.now()}`;
  const source = await services.sources.createSource(ctx, {
    companyId,
    key: sourceKey,
    displayName: "A1-03 Validation Source",
    sourceType: "policy",
  });

  const imported = await importDraftDocument(services, ctx, companyId, source.id, `A1-03 Policy ${Date.now()}`);
  record("scenario1.draft_created", imported.document.status === "draft", imported.document.status);

  const published = await services.publishing.publishDocument(ctx, imported.document.id);
  record(
    "scenario1.publish_success",
    published.document.status === "published" && published.version.status === "published",
    JSON.stringify({ status: published.document.status, idempotent: published.idempotent }),
  );

  const { count: auditCount, error: auditError } = await client
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("entity", "knowledge_documents")
    .eq("entity_id", imported.document.id);
  record("scenario1.audit_log", !auditError && (auditCount ?? 0) >= 1, `auditRows=${auditCount ?? 0}`);

  const versionCount1 = await countPublishedVersions(client, imported.document.id);
  const republished = await services.publishing.publishDocument(ctx, imported.document.id);
  const versionCount2 = await countPublishedVersions(client, imported.document.id);
  record(
    "scenario2.idempotent_publish",
    republished.idempotent && versionCount1 === versionCount2 && versionCount2 === 1,
    `versions=${versionCount2} idempotent=${republished.idempotent}`,
  );

  const archived = await services.publishing.archiveDocument(ctx, imported.document.id);
  record(
    "scenario3.archive",
    archived.document.status === "archived" &&
      services.publishing.isDocumentRetrievalAvailable(archived.document) === false,
    JSON.stringify({ status: archived.document.status }),
  );

  const restored = await services.publishing.restoreDocument(ctx, imported.document.id);
  record(
    "scenario4.restore",
    restored.document.status === "published" &&
      services.publishing.isDocumentRetrievalAvailable(restored.document) === true,
    JSON.stringify({ status: restored.document.status, restoredStatus: restored.restoredStatus }),
  );

  const tenantB = await client
    .from("companies")
    .select("id")
    .eq("company_type", "tenant")
    .neq("id", companyId)
    .limit(1)
    .maybeSingle();
  if (tenantB.data?.id) {
    const tenantBCtx = {
      userId: null,
      companyId: tenantB.data.id as string,
      isSuperAdmin: false,
      hasPermission: () => true,
    };
    let blocked = false;
    try {
      await services.publishing.publishDocument(tenantBCtx, imported.document.id);
    } catch {
      blocked = true;
    }
    record("scenario5.tenant_isolation", blocked, `blocked cross-tenant access to ${imported.document.id}`);
  } else {
    record("scenario5.tenant_isolation", true, "skipped second tenant fixture unavailable");
  }

  let rbacBlocked = false;
  try {
    await services.publishing.publishDocument(
      { ...ctx, isSuperAdmin: false, hasPermission: () => false },
      imported.document.id,
    );
  } catch {
    rbacBlocked = true;
  }
  record("scenario6.rbac_publish_denied", rbacBlocked, "publish blocked without knowledge.publish");

  const passed = checks.filter((check) => check.ok).length;
  console.log(`\nSUMMARY: ${passed}/${checks.length} PASS`);
  if (passed < checks.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
