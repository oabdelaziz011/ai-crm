import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function patchConfig<T extends keyof OperationsWorkspaceConfig>(
  updateDraft: (fn: (prev: OperationsWorkspaceConfig) => OperationsWorkspaceConfig) => void,
  key: T,
  value: OperationsWorkspaceConfig[T],
) {
  updateDraft((prev) => ({ ...prev, [key]: value, updatedAt: new Date().toISOString() }));
}
