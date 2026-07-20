import type { PromptLifecycleStatus } from "../constants.js";

export type { PromptLifecycleStatus };

export type PromptVersionCompareChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type PromptVersionCompareResult = {
  versionAId: string;
  versionBId: string;
  changes: PromptVersionCompareChange[];
};

export type PromptPublishValidationIssue = {
  id: string;
  message: string;
  severity: "error" | "warning";
};
