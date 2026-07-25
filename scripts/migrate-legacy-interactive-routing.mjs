/**
 * Migrate legacy Buttons/List parallel If/Else routing to Switch(last_button_id).
 *
 * Self-contained plain Node.js script (no TypeScript / workflow-builder imports).
 *
 * Usage:
 *   node scripts/migrate-legacy-interactive-routing.mjs --flow-id <uuid>
 *   node scripts/migrate-legacy-interactive-routing.mjs --flow-id <uuid> --dry-run
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  migrateLegacyInteractiveRouting,
  replaceFlowGraph,
  loadDraftGraphOrRestoreFromVersion,
} from "./lib/migrate-legacy-interactive-routing-core.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  for (const file of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // optional env files
    }
  }
  return env;
}

function parseArgs(argv) {
  const args = { dryRun: false, flowId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") args.dryRun = true;
    if (token === "--flow-id") args.flowId = argv[index + 1] ?? null;
  }
  return args;
}

const env = loadEnv();
const args = parseArgs(process.argv.slice(2));

if (!args.flowId) {
  console.error("Usage: node scripts/migrate-legacy-interactive-routing.mjs --flow-id <uuid> [--dry-run]");
  process.exit(1);
}

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env or artifacts/login-app/.env.local");
  process.exit(1);
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: flow, error: flowError } = await sb
  .from("automation_flows")
  .select("*")
  .eq("id", args.flowId)
  .single();
if (flowError || !flow) {
  console.error("Flow not found:", flowError?.message ?? args.flowId);
  process.exit(1);
}

const loaded = await loadDraftGraphOrRestoreFromVersion(sb, flow);
if (loaded.restoredFromVersionId) {
  console.warn(
    `Draft graph was empty; restored ${loaded.nodes.length} nodes and ${loaded.edges.length} edges from version ${loaded.restoredFromVersionId}.`,
  );
}

const sourceNodes = loaded.nodes;
const sourceEdges = loaded.edges;
const result = migrateLegacyInteractiveRouting(sourceNodes, sourceEdges);

console.log(
  JSON.stringify(
    {
      flowId: args.flowId,
      dryRun: args.dryRun,
      restoredFromVersionId: loaded.restoredFromVersionId,
      migratedInteractiveNodeIds: result.migratedNodeIds,
      nodeCountBefore: sourceNodes.length,
      nodeCountAfter: result.nodes.length,
      edgeCountBefore: sourceEdges.length,
      edgeCountAfter: result.edges.length,
    },
    null,
    2,
  ),
);

if (result.migratedNodeIds.length === 0) {
  console.log("No legacy interactive routing graphs detected.");
  process.exit(0);
}

if (args.dryRun) {
  console.log("Dry run complete. No database changes written.");
  process.exit(0);
}

try {
  await replaceFlowGraph(sb, args.flowId, result.nodes, result.edges);
  const { error: flowUpdateError } = await sb
    .from("automation_flows")
    .update({ has_unpublished_draft: true, updated_at: new Date().toISOString() })
    .eq("id", args.flowId);
  if (flowUpdateError) throw new Error(flowUpdateError.message);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log("Migration applied to draft graph. Publish the workflow to activate runtime routing.");
