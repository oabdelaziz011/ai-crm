import { createHash } from "node:crypto";

/** Job-scoped key so a second upload of the same file remains a separate import. */
export function buildCustomerImportRowIdempotencyKey(input: {
  jobId: string;
  contentSha256: string | null | undefined;
  rowNumber: number;
  values: unknown;
}): string {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(input.values ?? {}))
    .digest("hex")
    .slice(0, 16);
  const content = input.contentSha256?.trim() || "no-content-hash";
  return `${input.jobId}:${content}:${input.rowNumber}:${payloadHash}`;
}
