import type { HolidayBehavior } from "@/lib/scheduling/business-calendar";
import type { ValidationIssue } from "../types";
import { hasBilingualOrLegacyText, readBilingualMap } from "./bilingual-text";

const WORKFLOW_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createDefaultDatePickerConfig(): Record<string, unknown> {
  return {
    prompt: "من فضلك اختر تاريخاً",
    prompts: {
      ar: "من فضلك اختر تاريخاً",
      en: "Please choose a date",
    },
    saveAs: "selected_date",
    disablePastDates: true,
    disableCompanyHolidays: true,
    holidayBehavior: "disable" as HolidayBehavior,
    disableClosedWeekdays: true,
    branchId: null,
  };
}

export function readDatePickerConstraintOptions(config: Record<string, unknown>) {
  return {
    disablePastDates: config.disablePastDates !== false,
    disableCompanyHolidays: config.disableCompanyHolidays === true,
    holidayBehavior: (config.holidayBehavior === "warning" ? "warning" : "disable") as HolidayBehavior,
    disableClosedWeekdays: config.disableClosedWeekdays !== false,
    branchId: readString(config.branchId) || null,
  };
}

export function normalizeDatePickerNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const saveAs = readString(config.saveAs) || readString(config.inputKey) || "selected_date";
  const { ar, en } = readBilingualMap(config, "prompts", "prompt", ["questions", "messages"], ["question", "message"]);
  const prompt = ar.trim() || en.trim() || "Please choose a date";
  return {
    ...createDefaultDatePickerConfig(),
    ...config,
    prompt,
    prompts: { ar, en },
    saveAs,
    inputKey: saveAs,
    disablePastDates: config.disablePastDates !== false,
    disableCompanyHolidays: config.disableCompanyHolidays === true,
    holidayBehavior: config.holidayBehavior === "warning" ? "warning" : "disable",
    disableClosedWeekdays: config.disableClosedWeekdays !== false,
    branchId: readString(config.branchId) || null,
  };
}

export function validateDatePickerNodeConfig(
  config: Record<string, unknown>,
  nodeId: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!hasBilingualOrLegacyText(config, "prompts", "prompt", ["questions", "messages"], ["question", "message"])) {
    issues.push({
      id: `${nodeId}-prompt`,
      nodeId,
      message: "Add a prompt before publishing.",
      severity: "error",
      fieldLabelKey: "prompt",
    });
  }

  const saveAs = readString(config.saveAs);
  if (!saveAs) {
    issues.push({
      id: `${nodeId}-saveAs`,
      nodeId,
      message: "Choose a variable name for the selected date.",
      severity: "error",
      fieldLabelKey: "saveSelectedDateAs",
    });
  } else if (!WORKFLOW_VARIABLE_NAME_PATTERN.test(saveAs)) {
    issues.push({
      id: `${nodeId}-saveAs-invalid`,
      nodeId,
      message: "Use a valid workflow variable name (letters, numbers, underscores; must start with a letter or underscore).",
      severity: "error",
      fieldLabelKey: "saveSelectedDateAs",
    });
  }

  return issues;
}
