const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const INVALID_SYNTAX_PATTERN = /\{\{[^}]*$|^[^{]*\}\}|(\{\{[^}]*\{)|(\}[^}]*\}\})/;

export type ParsedVariableReference = {
  raw: string;
  path: string;
  start: number;
  end: number;
};

export function extractVariableReferences(template: string): ParsedVariableReference[] {
  const references: ParsedVariableReference[] = [];
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const raw = match[0];
    const path = match[1]?.trim() ?? "";
    if (!path) continue;
    references.push({
      raw,
      path,
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length,
    });
  }
  return references;
}

export function extractUniqueVariablePaths(template: string): string[] {
  const paths = extractVariableReferences(template).map((reference) => reference.path);
  return [...new Set(paths)];
}

export function hasInvalidVariableSyntax(template: string): boolean {
  if (INVALID_SYNTAX_PATTERN.test(template)) return true;
  const openCount = (template.match(/\{\{/g) ?? []).length;
  const closeCount = (template.match(/\}\}/g) ?? []).length;
  return openCount !== closeCount;
}

export function findDuplicateVariablePaths(template: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const reference of extractVariableReferences(template)) {
    if (seen.has(reference.path)) duplicates.add(reference.path);
    seen.add(reference.path);
  }
  return [...duplicates];
}
