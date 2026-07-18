import type { ExecutionPolicyOverrides, ExecutionRuntimePolicy, ProviderConnectionSnapshot } from "../types.js";
import { mergeExecutionPolicy, validateExecutionPolicy } from "../utils/execution-utils.js";

export class AIExecutionPolicyService {
  resolvePolicy(
    connection: ProviderConnectionSnapshot,
    overrides?: ExecutionPolicyOverrides,
  ): ExecutionRuntimePolicy {
    const policy = mergeExecutionPolicy(connection.configuration, overrides);
    validateExecutionPolicy(policy);
    return policy;
  }

  validatePolicy(policy: ExecutionRuntimePolicy): void {
    validateExecutionPolicy(policy);
  }
}
