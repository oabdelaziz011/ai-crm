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
  findDefault(companyId: string): Promise<CompanyChannelRecord | null>;
  list(filter: ListCompanyChannelsFilter): Promise<CompanyChannelRecord[]>;
  updateConfiguration(input: UpdateCompanyChannelConfigurationInput): Promise<CompanyChannelRecord>;
  enable(id: string): Promise<CompanyChannelRecord>;
  disable(id: string): Promise<CompanyChannelRecord>;
  setDefault(companyId: string, companyChannelId: string): Promise<CompanyChannelRecord>;
  updateHealth(input: UpdateCompanyChannelHealthInput): Promise<CompanyChannelRecord>;
}
