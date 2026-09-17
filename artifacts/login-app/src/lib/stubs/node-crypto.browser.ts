/**
 * Minimal Vite client stub for `node:crypto`.
 * Allows server-only modules to load in the browser graph without crashing at import time.
 * Callers that actually need HMAC must run on the server.
 */

function unavailable(name: string): never {
  throw new Error(`node:crypto.${name} is unavailable in the browser runtime.`);
}

export function createHmac(..._args: unknown[]): never {
  return unavailable("createHmac");
}

export function timingSafeEqual(..._args: unknown[]): never {
  return unavailable("timingSafeEqual");
}

export function randomBytes(..._args: unknown[]): never {
  return unavailable("randomBytes");
}

export function createHash(..._args: unknown[]): never {
  return unavailable("createHash");
}

export default {
  createHmac,
  timingSafeEqual,
  randomBytes,
  createHash,
};
