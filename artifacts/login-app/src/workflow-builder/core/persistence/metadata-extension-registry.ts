import type { WorkflowDocument } from "../types";

export type MetadataExtensionReader = (metadata: Record<string, unknown>) => Record<string, unknown> | undefined;

export type MetadataExtensionWriter = (
  document: WorkflowDocument,
  metadata: Record<string, unknown>,
) => Record<string, unknown>;

export type MetadataExtension = {
  read: MetadataExtensionReader;
  write: MetadataExtensionWriter;
};

const extensions: MetadataExtension[] = [];

export function registerMetadataExtension(extension: MetadataExtension): void {
  extensions.push(extension);
}

export function readDocumentExtensions(metadata: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const extension of extensions) {
    const slice = extension.read(metadata);
    if (slice) Object.assign(merged, slice);
  }
  return merged;
}

export function writeDocumentExtensions(
  document: WorkflowDocument,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  let next = { ...metadata };
  for (const extension of extensions) {
    next = extension.write(document, next);
  }
  return next;
}

export function resetMetadataExtensionsForTests(): void {
  extensions.length = 0;
}
