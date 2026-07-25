function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type InteractiveListRow = {
  id: string;
  title: string;
  description?: string;
  value?: string;
};

function readListRowsFromConfig(config: Record<string, unknown>): InteractiveListRow[] {
  const sections = Array.isArray(config.sections) ? config.sections : [];
  const rows: InteractiveListRow[] = [];

  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const sectionRows = Array.isArray((section as { rows?: unknown }).rows)
      ? (section as { rows: unknown[] }).rows
      : [];
    for (const row of sectionRows) {
      if (!row || typeof row !== "object") continue;
      const id = readString((row as { id?: unknown }).id);
      const title = readString((row as { title?: unknown }).title);
      if (!id || !title) continue;
      const description = readString((row as { description?: unknown }).description) ?? undefined;
      const value = readString((row as { value?: unknown }).value) ?? undefined;
      rows.push({ id, title, ...(description ? { description } : {}), ...(value ? { value } : {}) });
    }
  }

  return rows;
}

/**
 * Resolves the workflow variable value for a list selection.
 * Uses row.value when configured, otherwise row.id (WhatsApp reply id).
 */
export function resolveInteractiveListStoredValue(
  config: Record<string, unknown>,
  replyId: string,
): string | null {
  const normalizedReplyId = replyId.trim();
  if (!normalizedReplyId) return null;

  const rows = readListRowsFromConfig(config);
  const matched = rows.find((row) => row.id === normalizedReplyId);
  if (matched) {
    const explicitValue = readString(matched.value);
    return explicitValue ?? matched.id;
  }

  return normalizedReplyId;
}

export function readInteractiveListInputKey(config: Record<string, unknown>): string | null {
  return readString(config.inputKey) ?? readString(config.saveAs);
}
