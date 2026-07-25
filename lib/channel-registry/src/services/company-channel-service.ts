import {
  CHANNEL_HEALTH_STATUSES,
  CHANNEL_PERMISSIONS,
  COMPANY_CHANNEL_STATUSES,
} from "../constants.js";
import {
  CompanyChannelNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { ChannelRegistryRepository } from "../repositories/channel-registry-repository.js";
import type { CompanyChannelRepository } from "../repositories/company-channel-repository.js";
import type {
  CompanyChannelRecord,
  CreateCompanyChannelInput,
  ListCompanyChannelsFilter,
  ServiceContext,
  UpdateCompanyChannelConfigurationInput,
  UpdateCompanyChannelHealthInput,
} from "../types.js";
import {
  readWhatsAppPhoneNumberId,
  readWhatsAppVerifyToken,
} from "../utils/whatsapp-channel-utils.js";

function isWhatsAppChannel(channel: CompanyChannelRecord): boolean {
  return channel.communication_channel?.key === "whatsapp";
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(CHANNEL_PERMISSIONS.view);
  }
}

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function validateHealthStatus(value: string): void {
  if (!CHANNEL_HEALTH_STATUSES.includes(value as (typeof CHANNEL_HEALTH_STATUSES)[number])) {
    throw new ValidationError(`Unsupported health status: ${value}`);
  }
}

function validateStatus(value: string): void {
  if (!COMPANY_CHANNEL_STATUSES.includes(value as (typeof COMPANY_CHANNEL_STATUSES)[number])) {
    throw new ValidationError(`Unsupported channel status: ${value}`);
  }
}

export class CompanyChannelService {
  constructor(
    private readonly repository: CompanyChannelRepository,
    private readonly registryRepository: ChannelRegistryRepository,
  ) {}

  private async getAccessibleChannel(
    ctx: ServiceContext,
    companyChannelId: string,
  ): Promise<CompanyChannelRecord> {
    const channel = await this.repository.findById(companyChannelId);
    if (!channel) throw new CompanyChannelNotFoundError(companyChannelId);
    assertCompanyAccess(ctx, channel.company_id);
    return channel;
  }

  private async assertUniqueWhatsAppConfiguration(
    configuration: Record<string, unknown>,
    excludeCompanyChannelId?: string,
  ): Promise<void> {
    const phoneNumberId = readWhatsAppPhoneNumberId(configuration);
    if (phoneNumberId) {
      const matches = await this.repository.findCompanyChannelByPhoneNumberId(phoneNumberId);
      const duplicates = matches.filter((channel) => channel.id !== excludeCompanyChannelId);
      if (duplicates.length > 0) {
        throw new ValidationError(
          `WhatsApp phone number ID ${phoneNumberId} is already configured on another channel.`,
        );
      }
    }

    const verifyToken = readWhatsAppVerifyToken(configuration);
    if (verifyToken) {
      const matches = await this.repository.findCompanyChannelsByWhatsAppVerifyToken(
        verifyToken,
        excludeCompanyChannelId,
      );
      if (matches.length > 0) {
        throw new ValidationError("WhatsApp verify token is already in use by another channel.");
      }
    }
  }

  async findCompanyChannelByPhoneNumberId(
    ctx: ServiceContext,
    phoneNumberId: string,
  ): Promise<CompanyChannelRecord[]> {
    if (!ctx.isSuperAdmin) {
      throw new PermissionDeniedError(CHANNEL_PERMISSIONS.view);
    }

    return this.repository.findCompanyChannelByPhoneNumberId(phoneNumberId);
  }

  async findCompanyChannelByWhatsAppVerifyToken(
    ctx: ServiceContext,
    verifyToken: string,
    excludeCompanyChannelId?: string,
  ): Promise<CompanyChannelRecord[]> {
    if (!ctx.isSuperAdmin) {
      throw new PermissionDeniedError(CHANNEL_PERMISSIONS.view);
    }

    return this.repository.findCompanyChannelsByWhatsAppVerifyToken(
      verifyToken,
      excludeCompanyChannelId,
    );
  }

  async listEnabledWhatsAppChannels(ctx: ServiceContext): Promise<CompanyChannelRecord[]> {
    if (!ctx.isSuperAdmin) {
      throw new PermissionDeniedError(CHANNEL_PERMISSIONS.view);
    }

    return this.repository.listEnabledWhatsAppChannels();
  }

  async syncWhatsAppPhoneNumberId(
    ctx: ServiceContext,
    companyChannelId: string,
    phoneNumberId: string,
  ): Promise<CompanyChannelRecord> {
    if (!ctx.isSuperAdmin) {
      throw new PermissionDeniedError(CHANNEL_PERMISSIONS.manage);
    }

    const channel = await this.repository.findById(companyChannelId);
    if (!channel) throw new CompanyChannelNotFoundError(companyChannelId);

    return this.repository.updateConfiguration({
      companyChannelId,
      configuration: {
        ...channel.configuration,
        phoneNumberId: phoneNumberId.trim(),
      },
    });
  }

  async createConnection(
    ctx: ServiceContext,
    input: CreateCompanyChannelInput,
  ): Promise<CompanyChannelRecord> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);

    const channelType = await this.registryRepository.findById(input.channelId);
    if (!channelType) {
      throw new ValidationError("Selected communication channel type is not available.");
    }

    if (input.status) validateStatus(input.status);
    if (input.healthStatus) validateHealthStatus(input.healthStatus);

    const createdChannelType = await this.registryRepository.findById(input.channelId);
    if (createdChannelType?.key === "whatsapp" && input.configuration) {
      await this.assertUniqueWhatsAppConfiguration(input.configuration);
    }

    return this.repository.create(input);
  }

  async updateConfiguration(
    ctx: ServiceContext,
    input: UpdateCompanyChannelConfigurationInput,
  ): Promise<CompanyChannelRecord> {
    console.log("[channel-save-debug] CompanyChannelService.updateConfiguration() start", {
      companyChannelId: input.companyChannelId,
      configurationKeys: Object.keys(input.configuration ?? {}),
    });

    console.log("[channel-save-debug] before assertPermission(channels.manage)", {
      companyChannelId: input.companyChannelId,
      isSuperAdmin: ctx.isSuperAdmin,
    });
    try {
      assertPermission(ctx, CHANNEL_PERMISSIONS.manage);
    } catch (error) {
      console.log("[channel-save-debug] caught exception at assertPermission(channels.manage)", {
        companyChannelId: input.companyChannelId,
        error,
        stack: error instanceof Error ? error.stack : null,
      });
      throw error;
    }
    console.log("[channel-save-debug] after assertPermission(channels.manage)", {
      companyChannelId: input.companyChannelId,
    });

    console.log("[channel-save-debug] before getAccessibleChannel()", {
      companyChannelId: input.companyChannelId,
    });
    let channel: CompanyChannelRecord;
    try {
      channel = await this.getAccessibleChannel(ctx, input.companyChannelId);
    } catch (error) {
      console.log("[channel-save-debug] caught exception at getAccessibleChannel()", {
        companyChannelId: input.companyChannelId,
        error,
        stack: error instanceof Error ? error.stack : null,
      });
      throw error;
    }
    console.log("[channel-save-debug] after getAccessibleChannel()", {
      companyChannelId: channel.id,
      companyId: channel.company_id,
    });

    if (isWhatsAppChannel(channel)) {
      await this.assertUniqueWhatsAppConfiguration(input.configuration, channel.id);
    }

    console.log("[channel-save-debug] before repository.updateConfiguration() call", {
      companyChannelId: input.companyChannelId,
      loadedChannelId: channel.id,
    });
    let updated: CompanyChannelRecord;
    try {
      updated = await this.repository.updateConfiguration(input);
    } catch (error) {
      console.log("[channel-save-debug] caught exception at repository.updateConfiguration()", {
        companyChannelId: input.companyChannelId,
        error,
        stack: error instanceof Error ? error.stack : null,
      });
      throw error;
    }
    console.log("[channel-save-debug] immediately after repository.updateConfiguration()", {
      companyChannelId: updated.id,
    });
    console.log("[channel-save-debug] before return updated", {
      companyChannelId: updated.id,
    });
    return updated;
  }

  async enable(ctx: ServiceContext, companyChannelId: string): Promise<CompanyChannelRecord> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.manage);
    await this.getAccessibleChannel(ctx, companyChannelId);

    return this.repository.enable(companyChannelId);
  }

  async disable(ctx: ServiceContext, companyChannelId: string): Promise<CompanyChannelRecord> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.manage);
    await this.getAccessibleChannel(ctx, companyChannelId);

    return this.repository.disable(companyChannelId);
  }

  async getDefaultChannel(ctx: ServiceContext, companyId: string): Promise<CompanyChannelRecord | null> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);

    return this.repository.findDefault(companyId);
  }

  async listCompanyChannels(
    ctx: ServiceContext,
    filter: ListCompanyChannelsFilter,
  ): Promise<CompanyChannelRecord[]> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);

    if (filter.healthStatus) validateHealthStatus(filter.healthStatus);

    return this.repository.list(filter);
  }

  async updateHealth(
    ctx: ServiceContext,
    input: UpdateCompanyChannelHealthInput,
  ): Promise<CompanyChannelRecord> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.manage);
    await this.getAccessibleChannel(ctx, input.companyChannelId);
    validateHealthStatus(input.healthStatus);

    return this.repository.updateHealth(input);
  }

  async setDefaultChannel(
    ctx: ServiceContext,
    companyId: string,
    companyChannelId: string,
  ): Promise<CompanyChannelRecord> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.manage);
    assertCompanyAccess(ctx, companyId);

    const channel = await this.getAccessibleChannel(ctx, companyChannelId);
    if (channel.company_id !== companyId) {
      throw new ValidationError("Company channel does not belong to the specified company.");
    }
    if (!channel.is_enabled) {
      throw new ValidationError("Only enabled channels can be set as default.");
    }

    return this.repository.setDefault(companyId, companyChannelId);
  }

  async getCompanyChannel(ctx: ServiceContext, companyChannelId: string): Promise<CompanyChannelRecord> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.view);
    return this.getAccessibleChannel(ctx, companyChannelId);
  }
}
