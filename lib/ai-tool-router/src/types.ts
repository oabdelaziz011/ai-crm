import type { ConversationState } from "@workspace/ai-conversation";
import type {
  BuiltinToolKey,
  ToolExecutionStatus,
  ToolTriggerSource,
} from "./constants.js";

export type JsonSchema = Record<string, unknown>;

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number;
};

export type ToolDefinitionRecord = {
  id: string;
  key: string;
  display_name: string;
  description: string;
  category: string;
  version: string;
  is_enabled: boolean;
  required_permissions: string[];
  supported_states: ConversationState[];
  input_schema: JsonSchema;
  output_schema: JsonSchema;
  timeout_ms: number;
  retry_policy: RetryPolicy;
  created_at: string;
  updated_at: string;
};

export type ToolExecutionRecord = {
  id: string;
  company_id: string;
  conversation_id: string;
  tool_definition_id: string;
  tool_key: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: ToolExecutionStatus;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  triggered_by: ToolTriggerSource;
  created_by: string | null;
};

export type CreateToolExecutionInput = {
  companyId: string;
  conversationId: string;
  toolDefinitionId: string;
  toolKey: string;
  input: Record<string, unknown>;
  triggeredBy?: ToolTriggerSource;
  createdBy?: string | null;
};

export type CompleteToolExecutionInput = {
  executionId: string;
  status: ToolExecutionStatus;
  output?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs: number;
};

export type ListToolExecutionsFilter = {
  companyId: string;
  conversationId?: string;
  toolKey?: string;
  status?: ToolExecutionStatus;
  limit?: number;
};

export type RouteToolInput = {
  conversationId: string;
  toolKey: string;
  input: Record<string, unknown>;
  triggeredBy?: ToolTriggerSource;
};

export type ToolRouteResult = {
  executionId: string;
  toolKey: string;
  status: ToolExecutionStatus;
  output: Record<string, unknown> | null;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export type ConversationSnapshot = {
  id: string;
  company_id: string;
  state: ConversationState;
  /** Trusted CRM customer linked to the conversation — never from LLM tool args. */
  customer_id: string | null;
  /** Optional metadata (channel identity stamps). Absent on legacy readers. */
  metadata?: Record<string, unknown> | null;
};

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type UpdateToolDefinitionInput = {
  toolId: string;
  isEnabled: boolean;
};

export type BuiltinToolKeyType = BuiltinToolKey;
