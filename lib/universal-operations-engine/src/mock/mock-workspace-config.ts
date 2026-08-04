import type { OperationsWorkspaceConfig } from "../types/metadata-types.js";
import { buildDefaultOperationsWorkspaceConfig } from "../config/default-operations-workspace-config.js";

export const MOCK_CLINIC_CONFIG = buildDefaultOperationsWorkspaceConfig("clinic", "mock-company");
export const MOCK_TRAINING_CONFIG = buildDefaultOperationsWorkspaceConfig("training_center", "mock-company");
export const MOCK_AUTOMOTIVE_CONFIG = buildDefaultOperationsWorkspaceConfig("automotive", "mock-company");

export const MOCK_WORKSPACE_CONFIGS: OperationsWorkspaceConfig[] = [
  MOCK_CLINIC_CONFIG,
  MOCK_TRAINING_CONFIG,
  MOCK_AUTOMOTIVE_CONFIG,
];

export function getMockWorkspaceConfig(templateKey = "clinic"): OperationsWorkspaceConfig {
  return buildDefaultOperationsWorkspaceConfig(templateKey, "mock-company");
}
