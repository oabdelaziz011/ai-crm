import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { WhatsAppCredentialsLoader } from "../adapters/whatsapp/whatsapp-canonical-credentials.js";
import { CompanyChannelNotFoundError } from "../errors.js";

export async function resolveWhatsAppCompanyChannel(
  ports: ChannelPlatformPorts,
  companyChannelId: string,
  credentialsLoader?: WhatsAppCredentialsLoader,
): Promise<{ companyId: string; verifyToken: string; appSecret?: string }> {
  const channel = await ports.registry.getCompanyChannel(companyChannelId);
  if (!channel) throw new CompanyChannelNotFoundError(companyChannelId);

  if (credentialsLoader) {
    const credentials = await credentialsLoader.loadByCompanyId(channel.companyId);
    if (credentials?.verifyToken.trim()) {
      return {
        companyId: channel.companyId,
        verifyToken: credentials.verifyToken.trim(),
        appSecret: credentials.appSecret?.trim() || undefined,
      };
    }
  }

  const legacyVerifyToken =
    typeof channel.configuration.verifyToken === "string" ? channel.configuration.verifyToken.trim() : "";
  const legacyAppSecret =
    typeof channel.configuration.appSecret === "string" ? channel.configuration.appSecret.trim() : undefined;

  if (!legacyVerifyToken) {
    throw new Error(
      "WhatsApp webhook verify token is not configured. Update Settings → WhatsApp Provider.",
    );
  }

  return {
    companyId: channel.companyId,
    verifyToken: legacyVerifyToken,
    appSecret: legacyAppSecret,
  };
}
