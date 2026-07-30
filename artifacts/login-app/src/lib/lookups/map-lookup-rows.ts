import type { ListLookupConfig, LookupOptionRow } from "./types";

function readField(record: Record<string, unknown>, field: string): unknown {
  return record[field];
}

function stringifyField(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function mapRecordsToLookupRows(
  records: Record<string, unknown>[],
  config: Pick<ListLookupConfig, "displayField" | "valueField">,
): LookupOptionRow[] {
  return records.flatMap((record) => {
    const display = stringifyField(readField(record, config.displayField));
    const value = stringifyField(readField(record, config.valueField));
    if (!display || !value) return [];
    return [
      {
        id: value,
        title: display,
        value,
        description: stringifyField(readField(record, "description")) || undefined,
        record,
      },
    ];
  });
}

export function mapLookupRowsToListRows(rows: LookupOptionRow[]) {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    value: row.value ?? row.id,
    ...(row.record ? { record: row.record } : {}),
  }));
}
