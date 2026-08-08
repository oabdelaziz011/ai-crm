/**
 * Server-only WhatsApp inbound performance profiler.
 * Uses AsyncLocalStorage — do not import from browser /client entry points.
 * Install from api-server webhook handlers via @workspace/channel-platform/server.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type WhatsAppProfileStage = {
  name: string;
  durationMs: number;
  meta?: Record<string, unknown>;
};

type OpenMark = {
  name: string;
  startedAt: number;
  meta?: Record<string, unknown>;
};

const GLOBAL_KEY = "__WHATSAPP_PIPELINE_PROFILER__";
const GLOBAL_GETTER_KEY = "__WHATSAPP_GET_PIPELINE_PROFILER__";

const EXECUTION_STAGE_PREFIXES = [
  "Workflow resume",
  "engine.resume()",
  "Workflow node:",
  "OpenAI request",
  "Booking creation",
  "Outbound dispatch",
];

const profilerAls = new AsyncLocalStorage<WhatsAppPipelineProfiler>();

export class WhatsAppPipelineProfiler {
  readonly requestId: string;
  readonly startedAt = Date.now();
  private readonly stages: WhatsAppProfileStage[] = [];
  private readonly open = new Map<string, OpenMark>();
  private reportPrinted = false;
  private inboundExecution = false;

  constructor(requestId: string) {
    this.requestId = requestId;
  }

  /** Mark that this request ran AI or workflow automation. */
  markInboundExecution(reason?: string): void {
    this.inboundExecution = true;
    if (reason) {
      this.stages.push({
        name: "__execution_flag__",
        durationMs: 0,
        meta: { reason, internal: true },
      });
    }
  }

  hasInboundExecution(): boolean {
    if (this.inboundExecution) return true;
    return this.stages.some((stage) =>
      EXECUTION_STAGE_PREFIXES.some(
        (prefix) => stage.name === prefix || stage.name.startsWith(prefix),
      ),
    );
  }

  start(name: string, meta?: Record<string, unknown>): void {
    const key = this.open.has(name) ? `${name}#${this.open.size}` : name;
    this.open.set(key, { name, startedAt: Date.now(), meta: { ...meta, __openKey: key } });
  }

  end(name: string, meta?: Record<string, unknown>): number {
    let openKey: string | undefined;
    let open: OpenMark | undefined;
    if (this.open.has(name)) {
      openKey = name;
      open = this.open.get(name);
    } else {
      for (const [key, mark] of this.open) {
        if (mark.name === name) {
          openKey = key;
          open = mark;
        }
      }
    }

    const endedAt = Date.now();
    if (!open || !openKey) {
      this.stages.push({
        name,
        durationMs: 0,
        meta: { ...(meta ?? {}), warning: "end_without_start" },
      });
      return 0;
    }
    this.open.delete(openKey);
    const durationMs = endedAt - open.startedAt;
    this.stages.push({
      name,
      durationMs,
      meta: { ...(open.meta ?? {}), ...(meta ?? {}), __openKey: undefined },
    });
    return durationMs;
  }

  mark(name: string, durationMs: number, meta?: Record<string, unknown>): void {
    this.stages.push({ name, durationMs: Math.max(0, durationMs), meta });
  }

  async measure<T>(name: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T> {
    this.start(name, meta);
    try {
      return await fn();
    } finally {
      this.end(name);
    }
  }

  measureSync<T>(name: string, fn: () => T, meta?: Record<string, unknown>): T {
    this.start(name, meta);
    try {
      return fn();
    } finally {
      this.end(name);
    }
  }

  noteSkipped(name: string, reason: string): void {
    this.stages.push({ name, durationMs: 0, meta: { skipped: true, reason } });
  }

  /** Sum of Meta Graph send stages (excluded from server-side cache savings goals). */
  getMetaSendTotalMs(): number {
    return this.stages
      .filter((stage) => stage.name === "Meta send API" || stage.name.startsWith("Meta send API"))
      .reduce((sum, stage) => sum + stage.durationMs, 0);
  }

  getWallClockMs(): number {
    return Date.now() - this.startedAt;
  }

  /**
   * Print inbound-only report. No-op unless AI/workflow execution occurred.
   */
  printInboundReport(extra?: Record<string, unknown>): void {
    if (this.reportPrinted) return;
    if (!this.hasInboundExecution()) return;
    this.reportPrinted = true;

    for (const [key, mark] of [...this.open.entries()]) {
      this.open.delete(key);
      this.stages.push({
        name: mark.name,
        durationMs: Date.now() - mark.startedAt,
        meta: { ...(mark.meta ?? {}), warning: "auto_closed_at_report" },
      });
    }

    const visibleStages = this.stages.filter((stage) => stage.name !== "__execution_flag__");
    const totalMs = Date.now() - this.startedAt;
    const measuredSumMs = visibleStages.reduce((sum, stage) => sum + stage.durationMs, 0);
    const unaccountedMs = Math.max(0, totalMs - measuredSumMs);
    const slowest = visibleStages.reduce<WhatsAppProfileStage | null>((best, stage) => {
      if (!best || stage.durationMs > best.durationMs) return stage;
      return best;
    }, null);

    const lines = [
      "",
      "========== [WHATSAPP PERF - INBOUND] ==========",
      `requestId: ${this.requestId}`,
      ...(extra
        ? Object.entries(extra).map(([key, value]) => `${key}: ${String(value)}`)
        : []),
      "",
    ];

    for (const stage of visibleStages) {
      lines.push(stage.name);
      lines.push(`${stage.durationMs} ms`);
      lines.push("");
    }

    lines.push("Measured sum (may nest)");
    lines.push(`${measuredSumMs} ms`);
    lines.push("");
    lines.push("Unaccounted vs wall clock");
    lines.push(`${unaccountedMs} ms`);
    lines.push("");
    lines.push("Total");
    lines.push(`${totalMs} ms`);
    lines.push("");
    if (slowest) {
      lines.push(`SLOWEST STAGE: ${slowest.name} (${slowest.durationMs} ms)`);
    } else {
      lines.push("SLOWEST STAGE: (none recorded)");
    }
    lines.push("================================================");
    lines.push("");

    console.log(lines.join("\n"));
  }

  /** @deprecated use printInboundReport — kept as alias during transition */
  printReport(extra?: Record<string, unknown>): void {
    this.printInboundReport(extra);
  }
}

type GlobalProfilerHost = typeof globalThis & {
  [GLOBAL_KEY]?: WhatsAppPipelineProfiler | null;
  [GLOBAL_GETTER_KEY]?: () => WhatsAppPipelineProfiler | null;
};

export function getWhatsAppPipelineProfiler(): WhatsAppPipelineProfiler | null {
  return profilerAls.getStore() ?? (globalThis as GlobalProfilerHost)[GLOBAL_KEY] ?? null;
}

export function setWhatsAppPipelineProfiler(profiler: WhatsAppPipelineProfiler | null): void {
  const host = globalThis as GlobalProfilerHost;
  host[GLOBAL_KEY] = profiler;
  host[GLOBAL_GETTER_KEY] = getWhatsAppPipelineProfiler;
}

export async function runWithWhatsAppPipelineProfiler<T>(
  profiler: WhatsAppPipelineProfiler,
  fn: () => Promise<T>,
): Promise<T> {
  setWhatsAppPipelineProfiler(profiler);
  return profilerAls.run(profiler, async () => {
    try {
      return await fn();
    } finally {
      // Keep ALS store until caller prints; clear global only after print via set(null).
    }
  });
}
