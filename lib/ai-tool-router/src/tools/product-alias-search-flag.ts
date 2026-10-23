/**
 * Feature flag for catalog alias search.
 * Default OFF so production keeps legacy search until explicitly enabled.
 * Set VALUEOR_PRODUCT_ALIAS_SEARCH=1|true|on|yes to enable.
 *
 * Never read `process.env` as a default parameter. In the Vite browser bundle
 * `process` is undefined, and evaluating that default throws before catalog search.
 * This flag is not a credential. When the caller omits env, only the current
 * runtime's process env is consulted, and only when that object exists.
 */

function readRuntimeProcessEnv(): Record<string, string | undefined> {
  try {
    const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
    if (runtime.process?.env) return runtime.process.env;
  } catch {
    // Browser or a restricted runtime.
  }
  return {};
}

export function isProductAliasSearchEnabled(
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
): boolean {
  const source = env ?? readRuntimeProcessEnv();
  const raw = String(source.VALUEOR_PRODUCT_ALIAS_SEARCH ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}
