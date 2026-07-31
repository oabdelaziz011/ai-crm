const REQUIRED_IN_PRODUCTION = [
  "SESSION_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INTERNAL_API_KEY",
] as const;

export type PlatformEnv = {
  nodeEnv: string;
  sessionSecret: string;
  supabaseUrl: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  internalApiKey: string | undefined;
  redisUrl: string | undefined;
  otelEndpoint: string | undefined;
  webhookRequireSignature: boolean;
  webhookExecuteAi: boolean;
};

export function loadPlatformEnv(): PlatformEnv {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]?.trim());
  if (nodeEnv === "production" && missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (nodeEnv !== "development" && !sessionSecret) {
    throw new Error("SESSION_SECRET is required outside development.");
  }

  return {
    nodeEnv,
    sessionSecret: sessionSecret ?? "dev-secret",
    supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    supabaseServiceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
    internalApiKey: process.env.INTERNAL_API_KEY,
    redisUrl: process.env.REDIS_URL,
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    webhookRequireSignature: process.env.WEBHOOK_REQUIRE_SIGNATURE !== "false",
    webhookExecuteAi: process.env.WEBHOOK_EXECUTE_AI !== "false",
  };
}
