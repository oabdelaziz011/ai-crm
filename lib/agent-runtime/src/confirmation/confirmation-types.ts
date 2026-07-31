export type ConfirmationPolicy =
  | "never"
  | "destructive"
  | "external"
  | "financial"
  | "bulk"
  | "always";

export type ConfirmationRiskLevel = "low" | "medium" | "high" | "critical";

export type ToolConfirmationDeclaration = {
  toolKey: string;
  policy: ConfirmationPolicy;
  irreversible?: boolean;
  defaultRiskLevel?: ConfirmationRiskLevel;
  actionLabel?: string;
};

export type AffectedResource = {
  type: string;
  id?: string;
  label: string;
};

export type AgentConfirmationRequest = {
  tool: string;
  action: string;
  summary: string;
  affectedResources: AffectedResource[];
  riskLevel: ConfirmationRiskLevel;
  irreversible: boolean;
  confirmationToken: string;
  taskId: string;
  workflowId: string;
  expiresAt: string;
};

export type ConfirmationTokenRecord = {
  token: string;
  workflowId: string;
  taskId: string;
  toolKey: string;
  userId: string | null;
  companyId: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type ResumeAgentWorkflowInput = {
  workflowId: string;
  confirmationToken?: string;
};
