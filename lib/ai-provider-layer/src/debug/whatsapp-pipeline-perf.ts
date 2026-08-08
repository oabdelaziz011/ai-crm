/**
 * Thin bridge to the WhatsApp pipeline profiler installed on globalThis
 * by @workspace/channel-platform (temporary performance profiling).
 */

type ProfilerLike = {
  measure<T>(name: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T>;
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

export async function waPerfMeasure<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const profiler = getProfiler();
  if (!profiler) return fn();
  return profiler.measure(name, fn, meta);
}
