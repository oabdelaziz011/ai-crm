/**
 * Frontend runtime environment accessor.
 * Uses Vite import.meta.env only — never process.env or server secrets.
 */
export {
  isDevRuntime,
  isProdRuntime,
  isTestRuntime,
  readClientEnv,
  readClientEnvFlag,
} from "@workspace/platform-crypto/client";

import { readClientEnv as readEnv } from "@workspace/platform-crypto/client";

/** Requires an explicitly exposed VITE_* variable. */
export function requireClientEnv(name: string): string {
  if (!name.startsWith("VITE_")) {
    throw new Error(`${name} is not exposed to the browser runtime.`);
  }

  const value = readEnv(name);
  if (value) return value;

  // Node/tsx unit tests do not populate import.meta.env; allow process.env fallback off-browser only.
  if (typeof window === "undefined" && typeof process !== "undefined") {
    const fromProcess = process.env[name]?.trim();
    if (fromProcess) return fromProcess;
  }

  throw new Error(`Missing browser environment variable: ${name}`);
}
