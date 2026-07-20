/**
 * Background worker — drains embedding_jobs, indexes vectors, completes documents.
 * Run: pnpm --dir artifacts/platform-worker start
 */
import { createClient } from "@supabase/supabase-js";
import { createEmbeddingPlatformServices } from "@workspace/embedding-platform";
import type { EmbeddingTelemetryPort } from "@workspace/embedding-platform";
import { emitAlert, logStructured, platformMetrics } from "@workspace/platform-observability";
import { createVectorStoreServices } from "@workspace/vector-store";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeEnv } from "../../../scripts/lib/runtime-env.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
loadRuntimeEnv(projectRoot);

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5_000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 16);
const BATCH_CONCURRENCY = Number(process.env.WORKER_BATCH_SIZE ?? 16);
const MAX_CYCLES = Number(process.env.WORKER_MAX_CYCLES ?? 0);
const WORKER_ID = process.env.WORKER_ID ?? `embedding-worker-${process.pid}`;
const STALE_LOCK_SECONDS = Number(process.env.WORKER_STALE_LOCK_SECONDS ?? 900);

const SYSTEM_CONTEXT = {
  userId: null,
  companyId: null,
  isSuperAdmin: true,
  hasPermission: () => true,
};

const telemetry: EmbeddingTelemetryPort = {
  async recordExecution(event) {
    platformMetrics.increment(`embedding.${event.operation}.${event.status}`, event.batchSize ?? 1);
    logStructured({
      event: "embedding.telemetry",
      labels: {
        provider: event.providerKey,
        model: event.model,
        operation: event.operation,
        status: event.status,
      },
      detail: {
        latencyMs: event.latencyMs,
        batchSize: event.batchSize,
        errorMessage: event.errorMessage,
      },
    });
  },
};

function requireEnv(name: string, ...fallbackNames: string[]): string {
  for (const key of [name, ...fallbackNames]) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  throw new Error(`${name} is required for platform-worker`);
}

async function listCompaniesWithQueuedJobs(client: ReturnType<typeof createClient>): Promise<string[]> {
  const { data, error } = await client
    .from("embedding_jobs")
    .select("company_id")
    .eq("status", "queued")
    .limit(100);

  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.company_id as string))];
}

async function main() {
  const client = createClient(
    requireEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const vectorStore = createVectorStoreServices(client);
  const services = createEmbeddingPlatformServices(client, { telemetry, vectorStore });
  if (!services.worker) {
    throw new Error("Embedding worker orchestrator is unavailable.");
  }

  let cycles = 0;
  let shuttingDown = false;

  process.on("SIGTERM", () => {
    shuttingDown = true;
    logStructured({ event: "worker.shutdown", detail: { workerId: WORKER_ID } });
  });

  logStructured({
    event: "worker.start",
    detail: { workerId: WORKER_ID, pollMs: POLL_MS, batchSize: BATCH_SIZE, batchConcurrency: BATCH_CONCURRENCY },
  });

  while (!shuttingDown && (MAX_CYCLES === 0 || cycles < MAX_CYCLES)) {
    cycles += 1;
    let processedCount = 0;
    let failedCount = 0;
    let indexedDocuments = 0;

    try {
      const companyIds = await listCompaniesWithQueuedJobs(client);

      for (const companyId of companyIds) {
        const result = await services.worker.processCompanyQueue(SYSTEM_CONTEXT, companyId, {
          limit: BATCH_SIZE,
          batchSize: BATCH_CONCURRENCY,
          workerId: WORKER_ID,
          drain: true,
          recoverStaleLocks: true,
          staleLockSeconds: STALE_LOCK_SECONDS,
        });

        processedCount += result.jobs.length;
        failedCount += result.jobs.filter((job) => job.status === "failed").length;
        indexedDocuments += result.documents.filter((document) => document.status === "indexed").length;

        platformMetrics.increment("embedding.vectors.indexed", result.indexing.indexed);
        platformMetrics.increment("embedding.worker.recovered_locks", result.recoveredLocks);
        logStructured({
          event: "worker.batch.completed",
          labels: { companyId, workerId: WORKER_ID },
          detail: {
            jobs: result.jobs.length,
            batches: result.batches,
            indexedVectors: result.indexing.indexed,
            processingDurationMs: result.processingDurationMs,
          },
        });
      }

      platformMetrics.increment("embedding.jobs.processed", processedCount);
      platformMetrics.increment("embedding.jobs.failed", failedCount);
      platformMetrics.increment("embedding.documents.indexed", indexedDocuments);

      if (failedCount > 0) {
        emitAlert({
          name: "embedding_job_failures",
          severity: "warning",
          message: `${failedCount} embedding jobs failed in batch`,
          labels: { processed: processedCount, workerId: WORKER_ID },
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
        labels: { workerId: WORKER_ID },
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
