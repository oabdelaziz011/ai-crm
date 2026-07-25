export type ChannelWorkflowBindingRecord = {
  id: string;
  company_id: string;
  company_channel_id: string;
  automation_flow_id: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ChannelWorkflowBindingRepository = {
  findByCompanyChannelId(companyChannelId: string): Promise<ChannelWorkflowBindingRecord | null>;
};
