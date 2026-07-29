import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import { CompanyChannelNotFoundError } from "../errors.js";

export async function resolveEmailCompanyChannel(
  ports: ChannelPlatformPorts,
  companyChannelId: string,
): Promise<{ companyId: string }> {
  const channel = await ports.registry.getCompanyChannel(companyChannelId);
  if (!channel) throw new CompanyChannelNotFoundError(companyChannelId);
  return { companyId: channel.companyId };
}
