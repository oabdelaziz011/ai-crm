export {
  AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY,
  readAgentEmployeeExecutionContext,
  type AgentEmployeeExecutionContext,
} from "@login-app/lib/ai-employees/utilities/agent-employee-execution-context.js";
export {
  registerConversationToolScope,
  resolveActiveToolScope,
  runWithEmployeeToolScope,
} from "@login-app/lib/ai-employees/utilities/tool-scope-context.js";
export { createScopedRuntimeToolPort } from "@login-app/lib/ai-employees/utilities/scoped-runtime-tool-port.js";
export {
  createGuideToolGuard,
  createGuideConversationResolver,
  GUIDE_CONVERSATION_SOURCE,
  AI_GUIDE_TOOL_DENIED_CODE,
} from "@login-app/lib/floating-ai/guide/guide-security.js";
