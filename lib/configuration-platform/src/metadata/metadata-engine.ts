import type { MetadataFieldDefinition } from "../types.js";
import { validateConfigurationPayload } from "../validator/configuration-validator.js";

/** Normalizes and validates metadata-driven configuration payloads. */
export class ConfigurationMetadataEngine {
  private readonly schemas = new Map<string, readonly MetadataFieldDefinition[]>();

  registerSchema(domain: string, fields: readonly MetadataFieldDefinition[]): void {
    this.schemas.set(domain, Object.freeze([...fields]));
  }

  getSchema(domain: string): readonly MetadataFieldDefinition[] {
    return this.schemas.get(domain) ?? Object.freeze([]);
  }

  normalize(domain: string, config: Record<string, unknown>): Record<string, unknown> {
    return validateConfigurationPayload(config, this.getSchema(domain));
  }

  mergePatch(
    base: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.freeze({ ...base, ...patch });
  }
}

export function createDefaultConfigurationMetadataEngine(): ConfigurationMetadataEngine {
  const engine = new ConfigurationMetadataEngine();

  engine.registerSchema("operations.workspace", Object.freeze([
    Object.freeze({ key: "workspaceName", label: "Workspace Name", type: "text", required: true }),
    Object.freeze({ key: "moduleName", label: "Module Name", type: "text", required: true }),
    Object.freeze({ key: "rowEntityName", label: "Row Entity", type: "text", required: true }),
    Object.freeze({ key: "templateKey", label: "Template Key", type: "text", required: true }),
  ]));

  engine.registerSchema("crm", Object.freeze([
    Object.freeze({ key: "defaultOwnerId", label: "Default Owner", type: "lookup" }),
    Object.freeze({ key: "leadSources", label: "Lead Sources", type: "array" }),
    Object.freeze({ key: "customerTypes", label: "Customer Types", type: "array" }),
  ]));

  engine.registerSchema("billing", Object.freeze([
    Object.freeze({ key: "currencies", label: "Currencies", type: "array", required: true }),
    Object.freeze({ key: "paymentMethods", label: "Payment Methods", type: "array" }),
    Object.freeze({ key: "taxRules", label: "Tax Rules", type: "object" }),
  ]));

  engine.registerSchema("notifications", Object.freeze([
    Object.freeze({ key: "quietHours", label: "Quiet Hours", type: "object" }),
    Object.freeze({ key: "categories", label: "Categories", type: "array" }),
    Object.freeze({ key: "deliveryRules", label: "Delivery Rules", type: "object" }),
  ]));

  engine.registerSchema("ai", Object.freeze([
    Object.freeze({ key: "allowedTools", label: "Allowed Tools", type: "array" }),
    Object.freeze({ key: "knowledgeSources", label: "Knowledge Sources", type: "array" }),
    Object.freeze({ key: "safetyPolicies", label: "Safety Policies", type: "object" }),
  ]));

  engine.registerSchema("dashboard", Object.freeze([
    Object.freeze({ key: "widgets", label: "Widgets", type: "array" }),
    Object.freeze({ key: "defaultLayout", label: "Default Layout", type: "object" }),
    Object.freeze({ key: "executiveCards", label: "Executive Cards", type: "array" }),
  ]));

  return engine;
}
