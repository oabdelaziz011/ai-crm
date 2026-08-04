import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import type { OperationsConfigTab } from "@workspace/universal-operations-engine";

export type ConfigTabEditorProps = {
  draft: OperationsWorkspaceConfig;
  updateDraft: (
    patch: Partial<OperationsWorkspaceConfig> | ((prev: OperationsWorkspaceConfig) => OperationsWorkspaceConfig),
  ) => void;
};

export type ConfigAdvancedTabProps = ConfigTabEditorProps & {
  versions: Array<{ version: number; changeSummary?: string | null; publishedAt?: string | null }>;
  onRollback: (version: number) => void;
  onCompareVersion?: (version: number) => void;
};

export type { OperationsConfigTab };
