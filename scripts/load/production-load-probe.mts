/**
 * Production load probe — concurrent conversation listing and knowledge chunk counts.
 * Run: node --import tsx/esm scripts/load/production-load-probe.mts
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv, resolveSupabaseConfig } from "../lib/supabase-env.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 10);
const COMPANY_LIMIT = Number(process.env.LOAD_COMPANY_LIMIT ?? 5);
  const started = Date.now();
  const result = await fn();
  console.log(`[load] ${label}: ${Date.now() - started}ms`);
  return result;
}

async function main() {
  const env = loadSupabaseEnv(projectRoot);
  const config = resolveSupabaseConfig(env);
  if (!config) {
    throw new Error("Supabase config missing for load probe");
  }

  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: companies } = await client.from("companies").select("id").limit(COMPANY_LIMIT);
  const companyIds = (companies ?? []).map((row) => row.id as string);

  await timed("conversations.concurrent", async () => {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, index) =>
        client
          .from("conversations")
          .select("id, company_id, state")
          .eq("company_id", companyIds[index % Math.max(companyIds.length, 1)] ?? companyIds[0])
          .limit(25),
      ),
    );
  });

  await timed("knowledge.chunks.count", async () => {
    await client.from("knowledge_chunks").select("id", { count: "exact", head: true });
  });

  await timed("embedding.jobs.queued.count", async () => {
    await client.from("embedding_jobs").select("id", { count: "exact", head: true }).eq("status", "queued");
  });

  console.log("[load] probe complete");
}

main().catch((error) => {
  console.error("[load] failed", error);
  process.exit(1);
});
