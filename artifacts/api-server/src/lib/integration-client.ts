import { createClient } from "@supabase/supabase-js";
import { createIntegrationPlatformServices } from "@login-app/lib/integration/services/integration-platform-factory";

export function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials missing");
  return createClient(url, key);
}

let integrationServices: ReturnType<typeof createIntegrationPlatformServices> | null = null;

export function getIntegrationServices() {
  if (!integrationServices) {
    integrationServices = createIntegrationPlatformServices(getServiceClient());
  }
  return integrationServices;
}
