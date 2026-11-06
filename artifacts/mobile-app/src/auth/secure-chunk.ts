import type { KeyValueStore } from "./sign-in";

const CHUNK = 1800;

export function chunkedStore(backend: KeyValueStore): KeyValueStore {
  return {
    async getItem(key) {
      const countRaw = await backend.getItem(`${key}.n`);
      if (!countRaw) return backend.getItem(key);
      const count = Number(countRaw);
      if (!Number.isInteger(count) || count < 1) return null;
      let value = "";
      for (let index = 0; index < count; index += 1) {
        value += (await backend.getItem(`${key}.${index}`)) ?? "";
      }
      return value || null;
    },
    async setItem(key, value) {
      const count = Math.max(1, Math.ceil(value.length / CHUNK));
      await backend.setItem(`${key}.n`, String(count));
      for (let index = 0; index < count; index += 1) {
        await backend.setItem(`${key}.${index}`, value.slice(index * CHUNK, (index + 1) * CHUNK));
      }
    },
    async removeItem(key) {
      const countRaw = await backend.getItem(`${key}.n`);
      const count = Number(countRaw ?? 0);
      for (let index = 0; index < count; index += 1) await backend.removeItem(`${key}.${index}`);
      await backend.removeItem(`${key}.n`);
      await backend.removeItem(key);
    },
  };
}
