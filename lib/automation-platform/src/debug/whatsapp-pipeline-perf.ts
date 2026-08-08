/**
 * Thin bridge to the WhatsApp pipeline profiler installed on globalThis
 * by @workspace/channel-platform (temporary performance profiling).
 */

type ProfilerLike = {
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
