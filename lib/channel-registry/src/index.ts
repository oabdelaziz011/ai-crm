import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseChannelRegistryRepository } from "./repositories/supabase-channel-registry-repository.js";
import { createSupabaseCompanyChannelRepository } from "./repositories/supabase-company-channel-repository.js";
import { ChannelRegistryService } from "./services/channel-registry-service.js";
import { CompanyChannelService } from "./services/company-channel-service.js";

export type ChannelRegistryServices = {
  registry: ChannelRegistryService;
  companyChannels: CompanyChannelService;
};

export function createChannelRegistryServices(client: SupabaseClient): ChannelRegistryServices {
  const registryRepository = createSupabaseChannelRegistryRepository(client);
  const companyChannelRepository = createSupabaseCompanyChannelRepository(client);

  return {
    registry: new ChannelRegistryService(registryRepository),
    companyChannels: new CompanyChannelService(companyChannelRepository, registryRepository),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./services/channel-registry-service.js";
export * from "./services/company-channel-service.js";
export * from "./repositories/channel-registry-repository.js";
export * from "./repositories/company-channel-repository.js";
export * from "./repositories/supabase-channel-registry-repository.js";
export * from "./repositories/supabase-company-channel-repository.js";
export * from "./utils/whatsapp-channel-utils.js";
export * from "./utils/messenger-channel-utils.js";
