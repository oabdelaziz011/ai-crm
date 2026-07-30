const TEMPLATE_TOKEN_PATTERN = /\{\{[^}]+\}\}/;

export function containsTemplateToken(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return TEMPLATE_TOKEN_PATTERN.test(value);
}

export function resolvePreviewFilters(
  filters: Record<string, unknown> | undefined,
  previewValues: Record<string, string> | undefined,
): {
  unresolvedKeys: string[];
  resolvedFilters: Record<string, string>;
  hasTemplateTokens: boolean;
} {
  const resolvedFilters: Record<string, string> = {};
  const unresolvedKeys: string[] = [];
  let hasTemplateTokens = false;

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value == null || value === "") continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;

    if (containsTemplateToken(trimmed)) {
      hasTemplateTokens = true;
      const preview = previewValues?.[key]?.trim();
      if (preview && !containsTemplateToken(preview)) {
        resolvedFilters[key] = preview;
      } else {
        unresolvedKeys.push(key);
      }
      continue;
    }

    resolvedFilters[key] = trimmed;
  }

  return { unresolvedKeys, resolvedFilters, hasTemplateTokens };
}

export function readLookupPreviewValues(config: Record<string, unknown>): Record<string, string> {
  const raw = config._lookupPreviewValues;
  if (!raw || typeof raw !== "object") return {};
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      values[key] = value.trim();
    }
  }
  return values;
}
