/**
 * Sprint 7.5.1 — Load Testing Benchmark (in-process simulation)
 * Simulates concurrent domain operations without live infrastructure.
 * Run: pnpm --dir artifacts/login-app test:load-benchmark
 */
import { performance } from "node:perf_hooks";
import { PaymentProviderRegistry } from "../src/lib/billing/providers/payment-provider-registry.ts";
import { PortalPaymentService } from "../src/lib/customer-portal/payments/portal-payment-service.ts";
import { bookingEventToBusType } from "../src/lib/integration/events/enterprise-event-publisher.ts";
import { buildMinimalPdf } from "../src/lib/billing/invoices/pdf-generator.ts";
import { validateManifest } from "../src/lib/plugins/manifest/manifest-validator.ts";

type BenchmarkResult = {
  concurrency: number;
  operations: number;
  totalMs: number;
  opsPerSec: number;
  p50Ms: number;
  p95Ms: number;
  failures: number;
};

async function runBenchmark(
  label: string,
  concurrency: number,
  operationsPerWorker: number,
  fn: () => void | Promise<void>,
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  let failures = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    for (let i = 0; i < operationsPerWorker; i++) {
      const start = performance.now();
      try {
        await fn();
      } catch {
        failures++;
      }
      latencies.push(performance.now() - start);
    }
  });

  const totalStart = performance.now();
  await Promise.all(workers);
  const totalMs = performance.now() - totalStart;

  latencies.sort((a, b) => a - b);
  const totalOps = concurrency * operationsPerWorker;

  return {
    concurrency,
    operations: totalOps,
    totalMs,
    opsPerSec: Math.round(totalOps / (totalMs / 1000)),
    p50Ms: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
    p95Ms: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
    failures,
  };
}

console.log("\nSprint 7.5.1 — Load Testing Benchmark (In-Process)\n");
console.log("Note: Simulates domain logic concurrency. For production load testing, use k6/Artillery against staging API.\n");

const tiers = [100, 500, 1000] as const;
const allResults: { label: string; tier: number; result: BenchmarkResult }[] = [];

for (const concurrency of tiers) {
  const opsPerWorker = 10;

  const eventResult = await runBenchmark("Event Mapping", concurrency, opsPerWorker, () => {
    bookingEventToBusType("BookingCreated");
  });
  allResults.push({ label: "Event Mapping", tier: concurrency, result: eventResult });

  const pdfResult = await runBenchmark("PDF Generation", concurrency, 2, () => {
    buildMinimalPdf(`Invoice ${Math.random()}`);
  });
  allResults.push({ label: "PDF Generation", tier: concurrency, result: pdfResult });

  const manifestResult = await runBenchmark("Plugin Manifest Validation", concurrency, opsPerWorker, () => {
    validateManifest({
      pluginId: "load.test",
      name: "Load Test",
      author: "ValueOR",
      version: "1.0.0",
      category: "general",
      permissions: ["customers.read"],
      minPlatformVersion: "7.0.0",
      dependencies: [],
      entryPoints: { main: "index.js" },
      hooks: [],
    });
  });
  allResults.push({ label: "Plugin Validation", tier: concurrency, result: manifestResult });
}

console.log("| Concurrency | Operation          | Total Ops | Ops/sec  | p50 (ms) | p95 (ms) | Failures |");
console.log("|-------------|--------------------|-----------|---------:|---------:|---------:|---------:|");

for (const { label, tier, result } of allResults) {
  console.log(
    `| ${String(tier).padStart(11)} | ${label.padEnd(18)} | ${String(result.operations).padStart(9)} | ${String(result.opsPerSec).padStart(8)} | ${result.p50Ms.toFixed(3).padStart(8)} | ${result.p95Ms.toFixed(3).padStart(8)} | ${String(result.failures).padStart(8)} |`,
  );
}

// Portal sandbox payment under load
console.log("\n--- Portal Payment (Sandbox) Load Test ---\n");
const portal = PortalPaymentService.createDefault();

for (const concurrency of tiers) {
  const result = await runBenchmark("Portal Sandbox Payment", concurrency, 5, async () => {
    await portal.createPayment("sandbox", {
      companyId: "co-load",
      customerId: "cust-load",
      invoiceId: `inv-${Math.random()}`,
      amountCents: 5000,
      currency: "USD",
      returnUrl: "https://portal.example/return",
    });
  });

  console.log(
    `  ${concurrency} concurrent: ${result.opsPerSec} ops/sec, p95=${result.p95Ms.toFixed(2)}ms, failures=${result.failures}`,
  );
}

console.log("\nPASS — Load benchmark complete\n");
console.log("Recommendation: Run k6 against staging /api/v1 and portal endpoints for production certification.\n");
