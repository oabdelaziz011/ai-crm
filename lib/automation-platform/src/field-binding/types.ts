export const FIELD_BINDING_MODES = [
  "static",
  "variable",
  "expression",
  "formula",
  "ai_output",
] as const;

export type FieldBindingMode = (typeof FIELD_BINDING_MODES)[number];

export type FieldBinding =
  | { mode: "static"; value: string }
  | { mode: "variable"; variable: string }
  | { mode: "expression"; expression: string }
  | { mode: "formula"; formula: string }
  | { mode: "ai_output"; outputPath: string };

export const SUPPORTED_FIELD_BINDING_MODES = ["static", "variable"] as const;
export type SupportedFieldBindingMode = (typeof SUPPORTED_FIELD_BINDING_MODES)[number];
