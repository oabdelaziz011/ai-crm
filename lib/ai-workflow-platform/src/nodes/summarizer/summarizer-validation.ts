import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import type { AIWorkflowValidationIssue } from "../../types/validation.js";
import { readSummarizerMetadata } from "./types.js";

export function validateSummarizerInput(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  const summarizer = readSummarizerMetadata(config);
  if (summarizer.inputSource === "static") {
    if (summarizer.staticText?.trim()) return [];
    return [
      {
        id: "missing-static-input",
        code: "missing_static_input",
        field: "metadata.summarizer.staticText",
        message: "Enter the text to summarize or switch to a workflow variable.",
        severity: "error",
      },
    ];
  }

  if (summarizer.inputVariable?.trim()) return [];
  return [
    {
      id: "missing-input-variable",
      code: "missing_input_variable",
      field: "metadata.summarizer.inputVariable",
      message: "Select a workflow variable that contains the text to summarize.",
      severity: "error",
    },
  ];
}

export function validateSummarizerOutputVariable(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  if (config.outputVariable?.trim()) return [];
  return [
    {
      id: "missing-output-variable",
      code: "missing_output_variable",
      field: "outputVariable",
      message: "Define an output variable to store the summary result.",
      severity: "error",
    },
  ];
}

export function registerSummarizerValidationRules(
  register: (nodeKey: string, rule: (config: AIWorkflowNodeConfig) => AIWorkflowValidationIssue[]) => void,
): void {
  register("ai.summarizer", validateSummarizerInput);
  register("ai.summarizer", validateSummarizerOutputVariable);
}
