/**
 * Production webhook ingress must not target a developer laptop.
 * Local developer tunnels use a different hostname and config file.
 */
import { PRODUCTION_WEBHOOK_HOSTNAME } from "../lib/local-integration.mjs";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

export function isLoopbackService(service) {
  if (!service || !/^https?:\/\//i.test(service)) return false;
  try {
    return LOOPBACK.has(new URL(service).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function parseIngressPairs(configText) {
  const pairs = [];
  let hostname = null;
  for (const line of String(configText ?? "").split(/\r?\n/)) {
    const host = line.match(/^\s*(?:-\s*)?hostname:\s*(\S+)\s*$/);
    const service = line.match(/^\s*service:\s*(\S+)\s*$/);
    if (host) hostname = host[1];
    if (service && hostname) {
      pairs.push({ hostname, service: service[1] });
      hostname = null;
    }
  }
  return pairs;
}

export function productionIngressProblems(configText) {
  const problems = [];
  for (const pair of parseIngressPairs(configText)) {
    if (pair.hostname !== PRODUCTION_WEBHOOK_HOSTNAME) continue;
    if (isLoopbackService(pair.service) || pair.service.includes("production-api.invalid")) {
      problems.push(
        `${PRODUCTION_WEBHOOK_HOSTNAME} ingress ${pair.service} is not a supervised production API.`,
      );
    }
  }
  return problems;
}

export function renderProductionTunnelConfig(configText, origin) {
  const target = String(origin ?? "").trim().replace(/\/+$/, "");
  if (!target) {
    throw new Error("PRODUCTION_API_ORIGIN is required.");
  }
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error("PRODUCTION_API_ORIGIN must be an absolute http(s) URL.");
  }
  if (LOOPBACK.has(parsed.hostname.toLowerCase())) {
    throw new Error("PRODUCTION_API_ORIGIN must not be loopback.");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("PRODUCTION_API_ORIGIN must be http or https.");
  }

  const pairs = parseIngressPairs(configText);
  if (!pairs.some((pair) => pair.hostname === PRODUCTION_WEBHOOK_HOSTNAME)) {
    throw new Error(`Source config has no ${PRODUCTION_WEBHOOK_HOSTNAME} ingress.`);
  }

  return String(configText).replace(
    /(hostname:\s*webhook\.valueor\.org\s*\r?\n\s*service:\s*)\S+/,
    `$1${target}`,
  );
}
