import type {
  CompanyChannelRecord,
  CreateCompanyChannelInput,
  ListCompanyChannelsFilter,
  UpdateCompanyChannelConfigurationInput,
  UpdateCompanyChannelHealthInput,
} from "../types.js";

export interface CompanyChannelRepository {
  create(input: CreateCompanyChannelInput): Promise<CompanyChannelRecord>;
  findById(id: string): Promise<CompanyChannelRecord | null>;
  findCompanyChannelByPhoneNumberId(phoneNumberId: string): Promise<CompanyChannelRecord[]>;
  findCompanyChannelByInstagramBusinessAccountId(
    instagramBusinessAccountId: string,
  ): Promise<CompanyChannelRecord[]>;
  findCompanyChannelByMessengerPageId(pageId: string): Promise<CompanyChannelRecord[]>;
  findCompanyChannelsByWhatsAppVerifyToken(
    verifyToken: string,
    excludeCompanyChannelId?: string,
  ): Promise<CompanyChannelRecord[]>;
  findCompanyChannelsByInstagramVerifyToken(
    verifyToken: string,
    excludeCompanyChannelId?: string,
  ): Promise<CompanyChannelRecord[]>;
  findCompanyChannelsByMessengerVerifyToken(
    verifyToken: string,
    excludeCompanyChannelId?: string,
  ): Promise<CompanyChannelRecord[]>;
  listEnabledWhatsAppChannels(): Promise<CompanyChannelRecord[]>;
  listEnabledInstagramChannels(): Promise<CompanyChannelRecord[]>;
  listEnabledMessengerChannels(): Promise<CompanyChannelRecord[]>;
  findDefault(companyId: string): Promise<CompanyChannelRecord | null>;
  list(filter: ListCompanyChannelsFilter): Promise<CompanyChannelRecord[]>;
  updateConfiguration(input: UpdateCompanyChannelConfigurationInput): Promise<CompanyChannelRecord>;
  enable(id: string): Promise<CompanyChannelRecord>;
  disable(id: string): Promise<CompanyChannelRecord>;
  setDefault(companyId: string, companyChannelId: string): Promise<CompanyChannelRecord>;
  updateHealth(input: UpdateCompanyChannelHealthInput): Promise<CompanyChannelRecord>;
}
