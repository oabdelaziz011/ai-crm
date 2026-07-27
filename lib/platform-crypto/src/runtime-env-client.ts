type ClientEnvRecord = Record<string, string | boolean | undefined>;

function clientEnv(): ClientEnvRecord {
  return (import.meta as ImportMeta & { env?: ClientEnvRecord }).env ?? {};
}

function readImportMetaString(name: string): string {
  const value = clientEnv()[name];
  return typeof value === "string" ? value.trim() : "";
}

/** Browser/Vite runtime flags — import.meta.env only. Never references process. */
export function readClientEnv(name: string): string {
  const direct = readImportMetaString(name);
  if (direct) return direct;

  const viteName = name.startsWith("VITE_") ? name : `VITE_${name}`;
  return readImportMetaString(viteName);
}

export function readClientEnvFlag(name: string): boolean {
  const value = readClientEnv(name);
  return value === "1" || value === "true";
}

export function isTestRuntime(): boolean {
  return clientEnv().MODE === "test";
}

export function isDevRuntime(): boolean {
  return clientEnv().DEV === true;
}

export function isProdRuntime(): boolean {
  return clientEnv().PROD === true;
}
