/** Node/server runtime environment — process.env only. Do not import from browser bundles. */
export function readServerEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function readServerEnvFlag(name: string): boolean {
  return readServerEnv(name) === "1" || readServerEnv(name) === "true";
}

export function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test";
}

export function isProdRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}
