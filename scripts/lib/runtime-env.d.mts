export function loadRuntimeEnv(
  projectRoot: string,
  options?: { hydrateProcessEnv?: boolean; assertSafety?: boolean },
): Record<string, string | undefined>;

export function loadProjectEnv(
  projectRoot: string,
  options?: Record<string, unknown>,
): Record<string, string | undefined>;

export function normalizeProjectEnv(env: Record<string, string | undefined>): Record<string, string | undefined>;

export function resolveOpenAiApiKey(env?: Record<string, string | undefined>): string;
