import { MemoryPlatformCache } from "@workspace/platform-cache";
import type { Customer360Dto } from "../dto/customer-360-dto.js";

export type Customer360CacheKeyInput = {
  companyId: string;
  customerId: string;
  actorUserId: string;
};

export class Customer360Cache {
  private readonly cache = new MemoryPlatformCache();
  private readonly ttlSeconds: number;

  constructor(options?: { ttlSeconds?: number }) {
    this.ttlSeconds = options?.ttlSeconds ?? 60;
  }

  buildKey(input: Customer360CacheKeyInput): string {
    return `customer360:${input.companyId}:${input.customerId}:${input.actorUserId}`;
  }

  async get(key: string): Promise<Customer360Dto | null> {
    return this.cache.get<Customer360Dto>(key);
  }

  async set(key: string, value: Customer360Dto): Promise<void> {
    await this.cache.set(key, value, this.ttlSeconds);
  }

  async invalidate(key: string): Promise<void> {
    await this.cache.delete(key);
  }
}
