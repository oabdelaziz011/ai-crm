/**
 * Browser-safe bridge to the WhatsApp pipeline profiler.
 * Reads globalThis only — never imports node:async_hooks.
 * Server code installs the real profiler via whatsapp-pipeline-profiler.ts (API / webhooks).
 */

type ProfilerLike = {
  markInboundExecution(reason?: string): void;
  start(name: string, meta?: Record<string, unknown>): void;
  end(name: string, meta?: Record<string, unknown>): void;
  measure<T>(name: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T>;
  noteSkipped(name: string, reason: string): void;
};

const GLOBAL_KEY = "__WHATSAPP_PIPELINE_PROFILER__";
const GLOBAL_GETTER_KEY = "__WHATSAPP_GET_PIPELINE_PROFILER__";

function getProfiler(): ProfilerLike | null {
  const host = globalThis as Record<string, unknown>;
  const getter = host[GLOBAL_GETTER_KEY];
  if (typeof getter === "function") {
    return (getter as () => ProfilerLike | null)() ?? null;
  }
  return (host[GLOBAL_KEY] as ProfilerLike | undefined) ?? null;
}

export function waPerfMarkInboundExecution(reason?: string): void {
  getProfiler()?.markInboundExecution(reason);
}

export function waPerfStart(name: string, meta?: Record<string, unknown>): void {
  getProfiler()?.start(name, meta);
}

export function waPerfEnd(name: string, meta?: Record<string, unknown>): void {
  getProfiler()?.end(name, meta);
}

export async function waPerfMeasure<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const profiler = getProfiler();
  if (!profiler) return fn();
  return profiler.measure(name, fn, meta);
}

export function waPerfNoteSkipped(name: string, reason: string): void {
  getProfiler()?.noteSkipped(name, reason);
}
