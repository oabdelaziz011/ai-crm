/**
 * Feature flag for automatic AI product-alias generation.
 * Separate from VALUEOR_PRODUCT_ALIAS_SEARCH (which only affects search).
 * Default OFF so production does not call the AI provider until enabled.
 *
 * Enable with VALUEOR_PRODUCT_ALIAS_GENERATION=1|true|on|yes
 * (or VITE_VALUEOR_PRODUCT_ALIAS_GENERATION for the login-app browser bundle).
 *
 * IMPORTANT: Never evaluate `process.env` as a default parameter — `process`
 * is undefined in the Vite browser bundle and throws ReferenceError.
 *
 * Prefer injecting `isAliasGenerationEnabled` from the login-app host so Vite
 * can read `import.meta.env` in the app bundle (not a prebundled workspace pkg).
 */

function readNodeProcessEnv(): Record<string, string | undefined> {
  try {
    if (typeof process !== "undefined" && process?.env) {
      return process.env as Record<string, string | undefined>;
    }
  } catch {
    // Browser / restricted runtime
  }
  return {};
}

function readViteGenerationFlag(): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    if (!env) return "";
    const vite = env.VITE_VALUEOR_PRODUCT_ALIAS_GENERATION;
    if (typeof vite === "string" && vite.trim()) return vite;
    const plain = env.VALUEOR_PRODUCT_ALIAS_GENERATION;
    if (typeof plain === "string" && plain.trim()) return plain;
    return "";
  } catch {
    return "";
  }
}

function isTruthyFlag(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

export function isProductAliasGenerationEnabled(
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
): boolean {
  const source = env ?? readNodeProcessEnv();
  const fromEnv = String(source.VALUEOR_PRODUCT_ALIAS_GENERATION ?? "").trim();
  if (fromEnv) return isTruthyFlag(fromEnv);
  return isTruthyFlag(readViteGenerationFlag());
}
