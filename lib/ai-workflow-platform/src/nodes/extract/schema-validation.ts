import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import type { AIWorkflowValidationIssue } from "../../types/validation.js";
import type { ExtractionSchemaField } from "./types.js";
import { readExtractMetadata } from "./types.js";

function collectFieldNames(fields: ExtractionSchemaField[], prefix = ""): string[] {
  const names: string[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    names.push(path);
    if (field.type === "object" && field.children?.length) {
      names.push(...collectFieldNames(field.children, path));
    }
  }
  return names;
}

export function validateExtractionSchema(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  const extract = readExtractMetadata(config);
  const issues: AIWorkflowValidationIssue[] = [];
  if (extract.schema.fields.length === 0) {
    issues.push({
      id: "missing-schema",
      code: "missing_schema",
      field: "metadata.extract.schema",
      message: "Add at least one extraction field to the schema.",
      severity: "error",
    });
    return issues;
  }

  const names = collectFieldNames(extract.schema.fields);
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      issues.push({
        id: `duplicate-field-${name}`,
        code: "duplicate_field_name",
        field: "metadata.extract.schema",
        message: `Duplicate schema field name: ${name}`,
        severity: "error",
      });
    }
    seen.add(name);
  }

  const validateFields = (fields: ExtractionSchemaField[], depth = 0): void => {
    if (depth > 5) {
      issues.push({
        id: "schema-nesting-too-deep",
        code: "invalid_nesting",
        field: "metadata.extract.schema",
        message: "Schema nesting is too deep. Limit nested objects to 5 levels.",
        severity: "error",
      });
      return;
    }
    for (const field of fields) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name)) {
        issues.push({
          id: `invalid-field-name-${field.id}`,
          code: "invalid_field_name",
          field: "metadata.extract.schema",
          message: `Invalid field name: ${field.name}`,
          severity: "error",
        });
      }
      if (field.type === "enum" && (!field.enumValues || field.enumValues.length === 0)) {
        issues.push({
          id: `missing-enum-values-${field.id}`,
          code: "missing_enum_values",
          field: "metadata.extract.schema",
          message: `Enum field ${field.name} requires enum values.`,
          severity: "error",
        });
      }
      if ((field.type === "object" || field.type === "array") && field.children?.length) {
        validateFields(field.children, depth + 1);
      }
    }
  };

  validateFields(extract.schema.fields);
  return issues;
}

export function validateExtractInput(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  const extract = readExtractMetadata(config);
  if (extract.inputSource === "static") {
    if (extract.staticText?.trim()) return [];
    return [
      {
        id: "missing-static-input",
        code: "missing_static_input",
        field: "metadata.extract.staticText",
        message: "Enter source text to extract from or choose another input source.",
        severity: "error",
      },
    ];
  }
  if (extract.inputSource === "conversation_message") return [];
  if (extract.inputVariable?.trim()) return [];
  return [
    {
      id: "missing-input-variable",
      code: "missing_input_variable",
      field: "metadata.extract.inputVariable",
      message: "Select a workflow variable containing the text to extract.",
      severity: "error",
    },
  ];
}

export function validateExtractOutputVariable(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  if (config.outputVariable?.trim()) return [];
  return [
    {
      id: "missing-output-variable",
      code: "missing_output_variable",
      field: "outputVariable",
      message: "Define an output variable to store the extracted result.",
      severity: "error",
    },
  ];
}

export function registerExtractValidationRules(
  register: (nodeKey: string, rule: (config: AIWorkflowNodeConfig) => AIWorkflowValidationIssue[]) => void,
): void {
  register("ai.extract", validateExtractionSchema);
  register("ai.extract", validateExtractInput);
  register("ai.extract", validateExtractOutputVariable);
}
