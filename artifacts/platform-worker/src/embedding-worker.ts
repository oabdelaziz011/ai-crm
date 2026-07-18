/**
 * Background worker — drains embedding_jobs with retry and dead-letter handling.
 * Run: pnpm --dir artifacts/platform-worker start
 */
import { createClient } from "@supabase/supabase-js";
import { createEmbeddingPlatformServices } from "@workspace/embedding-platform";
import { emitAlert, logStructured, platformMetrics } from "@workspace/platform-observability";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5_000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 10);
const MAX_CYCLES = Number(process.env.WORKER_MAX_CYCLES ?? 0);

const SYSTEM_CONTEXT = {
  userId: null,
  companyId: null,
  isSuperAdmin: true,
  hasPermission: () => true,
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for platform-worker`);
  return value;
}

async function listCompaniesWithQueuedJobs(client: ReturnType<typeof createClient>): Promise<string[]> {
  const { data, error } = await client
    .from("embedding_jobs")
    .select("company_id")
    .eq("status", "queued")
    .limit(50);

  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.company_id as string))];
}

async function main() {
  const client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const services = createEmbeddingPlatformServices(client);
  let cycles = 0;

  logStructured({ event: "worker.start", detail: { pollMs: POLL_MS, batchSize: BATCH_SIZE } });

  while (MAX_CYCLES === 0 || cycles < MAX_CYCLES) {
    cycles += 1;
    let processedCount = 0;
    let failedCount = 0;

    try {
      const companyIds = await listCompaniesWithQueuedJobs(client);

      for (const companyId of companyIds) {
        const completed = await services.jobs.processBatch(SYSTEM_CONTEXT, companyId, {
          limit: BATCH_SIZE,
        });
        processedCount += completed.length;
        failedCount += completed.filter((job) => job.status === "failed").length;
      }

      platformMetrics.increment("embedding.jobs.processed", processedCount);
      platformMetrics.increment("embedding.jobs.failed", failedCount);

      if (failedCount > 0) {
        emitAlert({
          name: "embedding_job_failures",
          severity: "warning",
          message: `${failedCount} embedding jobs failed in batch`,
          labels: { processed: processedCount },
        });
      }

      if (processedCount === 0) {
        await sleep(POLL_MS);
      }
    } catch (error) {
      platformMetrics.increment("worker.errors");
      emitAlert({
        name: "embedding_worker_error",
        severity: "critical",
        message: error instanceof Error ? error.message : "Unknown worker error",
      });
      await sleep(POLL_MS);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  logStructured({ event: "worker.fatal", level: "error", detail: error });
  process.exit(1);
});
