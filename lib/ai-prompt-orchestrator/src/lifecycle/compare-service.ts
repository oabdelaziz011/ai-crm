import type { PromptTemplateVersionRecord } from "../types.js";
import type { PromptVersionCompareChange, PromptVersionCompareResult } from "./types.js";

function compareJson(field: string, before: unknown, after: unknown, changes: PromptVersionCompareChange[]) {
  const beforeJson = JSON.stringify(before ?? null);
  const afterJson = JSON.stringify(after ?? null);
  if (beforeJson !== afterJson) {
    changes.push({ field, before, after });
  }
}

export function comparePromptVersions(
  versionA: PromptTemplateVersionRecord,
  versionB: PromptTemplateVersionRecord,
): PromptVersionCompareResult {
  const changes: PromptVersionCompareChange[] = [];

  if (versionA.version_label !== versionB.version_label) {
    changes.push({ field: "version_label", before: versionA.version_label, after: versionB.version_label });
  }
  if (versionA.change_notes !== versionB.change_notes) {
    changes.push({ field: "change_notes", before: versionA.change_notes, after: versionB.change_notes });
  }
  compareJson("sections", versionA.sections, versionB.sections, changes);
  compareJson("output_contract", versionA.output_contract, versionB.output_contract, changes);
  compareJson("policies", versionA.policies, versionB.policies, changes);

  return {
    versionAId: versionA.id,
    versionBId: versionB.id,
    changes,
  };
}
