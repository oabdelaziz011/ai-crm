import { TOOL_REGISTRY, type ToolClassification } from "@workspace/ai-tool-router";

export type ToolMetadataEntry = {
  key: string;
  displayName: string;
  category: string;
  classification: ToolClassification;
  requiredPermissions: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
};

const RISK_BY_CLASSIFICATION: Record<ToolClassification, ToolMetadataEntry["riskLevel"]> = {
  production_ready: "medium",
  read_only: "low",
  mock: "low",
  requires_confirmation: "high",
};

const RISK_OVERRIDES: Record<string, ToolMetadataEntry["riskLevel"]> = {
  merge_customers: "critical",
  import_customers: "high",
  refund_payment: "critical",
  create_booking: "medium",
};

export function buildToolMetadataCatalog(
  dbTools: Array<{ key: string; display_name: string; category: string; required_permissions?: unknown }>,
): ToolMetadataEntry[] {
  const registryByKey = new Map(TOOL_REGISTRY.map((entry) => [entry.key, entry]));

  return dbTools.map((tool) => {
    const registryEntry = registryByKey.get(tool.key);
    const classification = registryEntry?.classification ?? "production_ready";
    const requiredPermissions = readStringArray(tool.required_permissions ?? registryEntry?.requiredPermissions);

    return {
      key: tool.key,
      displayName: registryEntry?.displayName ?? tool.display_name,
      category: registryEntry?.category ?? tool.category,
      classification,
      requiredPermissions,
      riskLevel: RISK_OVERRIDES[tool.key] ?? RISK_BY_CLASSIFICATION[classification],
    };
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function summarizeToolPermissions(requiredPermissions: string[]): string {
  if (requiredPermissions.length === 0) return "No extra permissions";
  if (requiredPermissions.length <= 2) return requiredPermissions.join(", ");
  return `${requiredPermissions.slice(0, 2).join(", ")} +${requiredPermissions.length - 2}`;
}
