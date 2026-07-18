import type { CommunicationChannelRecord } from "../types.js";

export interface ChannelRegistryRepository {
  listActive(): Promise<CommunicationChannelRecord[]>;
  findById(id: string): Promise<CommunicationChannelRecord | null>;
  findByKey(key: string): Promise<CommunicationChannelRecord | null>;
}
