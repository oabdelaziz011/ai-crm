import { sha256Bytes, sha256Hex } from "@workspace/platform-crypto";

export function computeChecksum(value: string): string {
  return sha256Hex(value);
}

export function computeEmbeddingChecksum(input: {
  chunkChecksum: string;
  provider: string;
  model: string;
  vector: number[];
}): string {
  const payload = [
    input.chunkChecksum,
    input.provider,
    input.model,
    input.vector.map((value) => value.toFixed(6)).join(","),
  ].join("|");
  return computeChecksum(payload);
}

export function computeStubVector(text: string, dimensions: number): number[] {
  const hash = sha256Bytes(new TextEncoder().encode(text));
  const vector: number[] = [];
  for (let index = 0; index < dimensions; index += 1) {
    const byte = hash[index % hash.length] ?? 0;
    vector.push(Number(((byte / 255) * 2 - 1).toFixed(6)));
  }
  return vector;
}

export function validateEmbeddingChecksum(input: {
  chunkChecksum: string;
  provider: string;
  model: string;
  vector: number[];
  checksum: string;
}): boolean {
  return computeEmbeddingChecksum(input) === input.checksum;
}
