import { readClientEnv, readClientEnvFlag } from "./runtime-env-client.js";

function readProcessEnvFlag(name: string): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  const value = process.env[name];
  return value === "1" || value === "true";
}

/** Runtime flag readable in Node (process.env) and Vite (import.meta.env). */
export function readRuntimeEnvFlag(name: string): boolean {
  if (readProcessEnvFlag(name)) return true;

  const viteName = name.startsWith("VITE_") ? name : `VITE_${name}`;
  return readClientEnvFlag(name) || readClientEnvFlag(viteName);
}

export function readRuntimeEnv(name: string): string {
  if (typeof process !== "undefined" && process.env) {
    const direct = process.env[name]?.trim();
    if (direct) return direct;
    const viteName = name.startsWith("VITE_") ? name : `VITE_${name}`;
    const vite = process.env[viteName]?.trim();
    if (vite) return vite;
  }

  return readClientEnv(name);
}
