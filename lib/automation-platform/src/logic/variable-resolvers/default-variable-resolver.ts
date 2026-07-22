export function traverseVariablePath(
  segments: string[],
  variables: Record<string, unknown>,
): unknown {
  let current: unknown = variables;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
