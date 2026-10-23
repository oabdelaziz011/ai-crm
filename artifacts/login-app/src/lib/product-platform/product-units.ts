export const PRODUCT_UNITS = [
  "each",
  "piece",
  "box",
  "pack",
  "kg",
  "g",
  "liter",
  "meter",
  "sqm",
  "hour",
  "day",
] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];
