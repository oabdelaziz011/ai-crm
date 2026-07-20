export type WhatsAppCompanyConfig = {
  companyId: string;
  phoneNumberId: string;
  businessAccountId?: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  apiVersion?: string;
};

export type WhatsAppConfigResolver = (companyId: string) => Promise<WhatsAppCompanyConfig | null>;

export function parseWhatsAppCompanyConfig(
  companyId: string,
  configuration: Record<string, unknown>,
): WhatsAppCompanyConfig {
  return {
    companyId,
    phoneNumberId: readRequiredString(configuration, "phoneNumberId"),
    businessAccountId: readOptionalString(configuration, "businessAccountId"),
    accessToken: readRequiredString(configuration, "accessToken"),
    verifyToken: readRequiredString(configuration, "verifyToken"),
    appSecret: readOptionalString(configuration, "appSecret"),
    apiVersion: readOptionalString(configuration, "apiVersion") ?? "v21.0",
  };
}

export class InMemoryWhatsAppConfigStore {
  private readonly configs = new Map<string, WhatsAppCompanyConfig>();

  set(config: WhatsAppCompanyConfig): this {
    this.configs.set(config.companyId, config);
    return this;
  }

  resolve = async (companyId: string): Promise<WhatsAppCompanyConfig | null> => {
    return this.configs.get(companyId) ?? null;
  };
}

export function createInMemoryWhatsAppConfigResolver(
  store: InMemoryWhatsAppConfigStore = new InMemoryWhatsAppConfigStore(),
): WhatsAppConfigResolver {
  return (companyId) => store.resolve(companyId);
}

export function whatsAppGraphBaseUrl(apiVersion: string): string {
  return `https://graph.facebook.com/${apiVersion}`;
}

export function whatsAppMessagesUrl(config: Pick<WhatsAppCompanyConfig, "phoneNumberId" | "apiVersion">): string {
  return `${whatsAppGraphBaseUrl(config.apiVersion ?? "v21.0")}/${config.phoneNumberId}/messages`;
}

function readRequiredString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`WhatsApp configuration missing required field: ${key}`);
  }
  return value.trim();
}

function readOptionalString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
