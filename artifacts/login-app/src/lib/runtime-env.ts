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
  if (!value) {
    throw new Error(`Missing browser environment variable: ${name}`);
  }
  return value;
}
