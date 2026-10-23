/**
 * Browser-safe alias-generation flag for the login-app Vite bundle.
 * Reads VITE_VALUEOR_PRODUCT_ALIAS_GENERATION via static import.meta.env access
 * so Vite can inline the value. Never touches `process`.
 */

function isTruthyFlag(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

export function isLoginAppProductAliasGenerationEnabled(): boolean {
  try {
    const vite = import.meta.env.VITE_VALUEOR_PRODUCT_ALIAS_GENERATION;
    return typeof vite === "string" && isTruthyFlag(vite);
  } catch {
    return false;
  }
}
