export * from "./types.js";
export * from "./feature-keys.js";
export * from "./capability-ids.js";
export * from "./feature-defaults.js";
export * from "./capability-mapping.js";
export * from "./feature-registry.js";
export * from "./knowledge-feature-access.js";
export * from "./workflow-feature-access.js";
export * from "./analytics-feature-access.js";
export * from "./platform-ai-provider-service.js";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPlatformAIProviderService } from "./platform-ai-provider-service.js";

export function createPlatformAIProviderServices(client: SupabaseClient) {
  return {
    platform: createPlatformAIProviderService(client),
  };
}
