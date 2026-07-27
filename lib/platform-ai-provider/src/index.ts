export * from "./types.js";
export * from "./platform-ai-provider-service.js";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPlatformAIProviderService } from "./platform-ai-provider-service.js";

export function createPlatformAIProviderServices(client: SupabaseClient) {
  return {
    platform: createPlatformAIProviderService(client),
  };
}
