export type ChannelWorkflowBindingRecord = {
  id: string;
  companyId: string;
  companyChannelId: string;
  automationFlowId: string;
  isEnabled: boolean;
};

/** Binding row for list views, with optional resolved flow name. */
export type ChannelWorkflowBindingListItem = ChannelWorkflowBindingRecord & {
  flowName: string | null;
};

export type ActiveAutomationFlowOption = {
  id: string;
  name: string;
};

export type SaveChannelWorkflowBindingInput = {
  companyId: string;
  companyChannelId: string;
  workflowEnabled: boolean;
  automationFlowId: string | null;
  existingBinding: ChannelWorkflowBindingRecord | null;
};

export type SaveChannelWorkflowBindingResult =
  | { action: "created"; bindingId: string }
  | { action: "updated"; bindingId: string }
  | { action: "disabled"; bindingId: string }
  | { action: "removed"; bindingId: string }
  | { action: "noop" };
