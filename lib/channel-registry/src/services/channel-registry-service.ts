import { CHANNEL_PERMISSIONS } from "../constants.js";
import { CommunicationChannelNotFoundError, PermissionDeniedError } from "../errors.js";
import type { ChannelRegistryRepository } from "../repositories/channel-registry-repository.js";
import type { CommunicationChannelRecord, ServiceContext } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export class ChannelRegistryService {
  constructor(private readonly repository: ChannelRegistryRepository) {}

  async listChannelTypes(ctx: ServiceContext): Promise<CommunicationChannelRecord[]> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.view);
    return this.repository.listActive();
  }

  async getChannelType(ctx: ServiceContext, key: string): Promise<CommunicationChannelRecord> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.view);

    const channel = await this.repository.findByKey(key);
    if (!channel) throw new CommunicationChannelNotFoundError(key);
    return channel;
  }

  async getChannelTypeById(ctx: ServiceContext, id: string): Promise<CommunicationChannelRecord> {
    assertPermission(ctx, CHANNEL_PERMISSIONS.view);

    const channel = await this.repository.findById(id);
    if (!channel) throw new CommunicationChannelNotFoundError(id);
    return channel;
  }
}
