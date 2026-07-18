import { sha256Hex } from "@workspace/platform-crypto";

export function buildExternalReference(providerKey: string, collectionName: string, vectorId: string): string {
  return sha256Hex(`${providerKey}:${collectionName}:${vectorId}`).slice(0, 32);
}
