/**
 * LOCAL-only per-developer integration tunnel helpers.
 * Never points at production webhook.valueor.org / vaultos-webhook.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  isProductionWebhookUrl,
  resolveValueorEnv,
  VALUEOR_ENV_LOCAL,
} from "./env-mode.mjs";

export const PRODUCTION_TUNNEL_NAME = "vaultos-webhook";
export const PRODUCTION_WEBHOOK_HOSTNAME = "webhook.valueor.org";
export const LOCAL_INTEGRATION_ENV_FILE = ".env.local.integration";
export const LOCAL_API_PORT = 3001;
export const LOCAL_API_ORIGIN = `http://localhost:${LOCAL_API_PORT}`;

/** Keys overlaid from `.env.local.integration` onto the localstack profile. */
export const LOCAL_INTEGRATION_OVERLAY_KEYS = [
  "LOCAL_INTEGRATION_ENABLED",
  "ALLOW_LOCAL_EXTERNAL_OUTBOUND",
  "PUBLIC_WEBHOOK_BASE_URL",
  "WEBHOOK_BASE_URL",
  "VITE_WEBHOOK_BASE_URL",
  "CLOUDFLARE_TUNNEL_CONFIG",
  "CLOUDFLARE_TUNNEL_HOSTNAME",
  "CLOUDFLARE_TUNNEL_NAME",
  "CLOUDFLARE_TUNNEL_ID",
  "CLOUDFLARE_TUNNEL_TOKEN",
  "CLOUDFLARE_TUNNEL_CREDENTIALS_FILE",
];

export function parseEnvFileContents(raw) {
  const env = {};
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

export function readEnvFileMap(filePath) {
  if (!existsSync(filePath)) return {};
  return parseEnvFileContents(readFileSync(filePath, "utf8"));
}

export function readLocalIntegrationEnv(projectRoot) {
  return readEnvFileMap(resolve(projectRoot, LOCAL_INTEGRATION_ENV_FILE));
}

export function applyLocalIntegrationOverlay(env, integrationEnv) {
  const out = { ...env };
  for (const key of LOCAL_INTEGRATION_OVERLAY_KEYS) {
    const value = integrationEnv?.[key];
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

export function isLocalIntegrationEnabled(env = {}) {
  const raw = String(env.LOCAL_INTEGRATION_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isLocalExternalOutboundExplicitlyAllowed(env = {}) {
  return (
    String(env.ALLOW_LOCAL_EXTERNAL_OUTBOUND ?? "").trim() === "1" &&
    isLocalIntegrationEnabled(env)
  );
}

export function normalizeWebhookOrigin(url) {
  if (!url?.trim()) return "";
  return url.trim().replace(/\/+$/, "");
}

export function isForbiddenProductionWebhookHost(urlOrHost) {
  if (!urlOrHost?.trim()) return false;
  const raw = urlOrHost.trim().toLowerCase();
  if (isProductionWebhookUrl(raw) || isProductionWebhookUrl(`https://${raw}`)) {
    return true;
  }
  try {
    const host = raw.includes("://") ? new URL(raw).hostname : raw.split("/")[0];
    return host === PRODUCTION_WEBHOOK_HOSTNAME;
  } catch {
    return /webhook\.valueor\.org/i.test(raw);
  }
}

export function isForbiddenProductionTunnelName(name) {
  if (!name?.trim()) return false;
  return name.trim().toLowerCase() === PRODUCTION_TUNNEL_NAME;
}

/**
 * Resolve the public webhook base for LOCAL. Never returns production.
 * Preference: PUBLIC_WEBHOOK_BASE_URL → WEBHOOK_BASE_URL → VITE_WEBHOOK_BASE_URL.
 * Unset when nothing safe is configured (no production fallback).
 */
export function resolveLocalPublicWebhookBase(env = {}) {
  const candidates = [
    env.PUBLIC_WEBHOOK_BASE_URL,
    env.WEBHOOK_BASE_URL,
    env.VITE_WEBHOOK_BASE_URL,
  ];
  for (const candidate of candidates) {
    const origin = normalizeWebhookOrigin(candidate);
    if (!origin) continue;
    if (isForbiddenProductionWebhookHost(origin)) continue;
    return origin;
  }
  return null;
}

/**
 * Production / non-local may use configured bases including production.
 * Local never falls back to webhook.valueor.org.
 */
export function resolvePublicWebhookBaseForMode(env = {}) {
  const mode = resolveValueorEnv(env.VALUEOR_ENV);
  if (mode === VALUEOR_ENV_LOCAL) {
    return resolveLocalPublicWebhookBase(env);
  }
  const origin =
    normalizeWebhookOrigin(env.PUBLIC_WEBHOOK_BASE_URL) ||
    normalizeWebhookOrigin(env.WEBHOOK_BASE_URL) ||
    normalizeWebhookOrigin(env.VITE_WEBHOOK_BASE_URL) ||
    null;
  return origin;
}

export function buildWebhookCallbackUrls(baseUrl) {
  const base = normalizeWebhookOrigin(baseUrl);
  if (!base) {
    return {
      instagram: null,
      whatsapp: null,
      messenger: null,
      sms: null,
    };
  }
  return {
    instagram: `${base}/api/webhooks/instagram`,
    whatsapp: `${base}/api/webhooks/whatsapp`,
    messenger: `${base}/api/webhooks/messenger`,
    sms: `${base}/api/webhooks/sms`,
  };
}

export function isLocalApiServiceTarget(serviceUrl, port = LOCAL_API_PORT) {
  if (!serviceUrl?.trim()) return false;
  try {
    const url = new URL(serviceUrl.trim());
    const hostOk = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const portOk = String(url.port || (url.protocol === "https:" ? "443" : "80")) === String(port);
    const httpOk = url.protocol === "http:" || url.protocol === "https:";
    return hostOk && portOk && httpOk;
  } catch {
    return false;
  }
}

/**
 * Minimal cloudflared config ingress scrape (no YAML dependency).
 * @returns {{ tunnelName: string|null, hostnames: string[], services: string[] }}
 */
export function parseCloudflaredConfigSummary(yamlText) {
  const text = String(yamlText ?? "");
  const tunnelMatch = text.match(/^\s*tunnel:\s*(.+)\s*$/m);
  const tunnelName = tunnelMatch ? tunnelMatch[1].trim().replace(/^["']|["']$/g, "") : null;
  const hostnames = [...text.matchAll(/^\s*-\s*hostname:\s*(.+)\s*$/gm)].map((m) =>
    m[1].trim().replace(/^["']|["']$/g, ""),
  );
  const services = [...text.matchAll(/^\s*service:\s*(https?:\/\/\S+)\s*$/gm)].map((m) =>
    m[1].trim().replace(/^["']|["']$/g, ""),
  );
  return { tunnelName, hostnames, services };
}

export function resolveDeveloperTunnelConfigPath(projectRoot, env = {}) {
  const raw = typeof env.CLOUDFLARE_TUNNEL_CONFIG === "string" ? env.CLOUDFLARE_TUNNEL_CONFIG.trim() : "";
  if (!raw) return null;
  return isAbsolute(raw) ? resolve(raw) : resolve(projectRoot, raw);
}

/**
 * Fail-fast safety for LOCAL developer tunnels.
 * Never allows production hostname, production tunnel name, or non-local API targets.
 */
export function assertLocalDeveloperTunnelSafety({
  projectRoot,
  env = {},
  configText = null,
  requireConfig = true,
} = {}) {
  const mode = resolveValueorEnv(env.VALUEOR_ENV);
  if (mode !== VALUEOR_ENV_LOCAL) {
    throw new Error("dev:tunnel requires VALUEOR_ENV=local.");
  }

  const errors = [];

  if (isForbiddenProductionTunnelName(env.CLOUDFLARE_TUNNEL_NAME)) {
    errors.push(`CLOUDFLARE_TUNNEL_NAME must not be "${PRODUCTION_TUNNEL_NAME}" (production).`);
  }
  if (isForbiddenProductionWebhookHost(env.CLOUDFLARE_TUNNEL_HOSTNAME)) {
    errors.push(`CLOUDFLARE_TUNNEL_HOSTNAME must not be ${PRODUCTION_WEBHOOK_HOSTNAME}.`);
  }
  for (const key of ["PUBLIC_WEBHOOK_BASE_URL", "WEBHOOK_BASE_URL", "VITE_WEBHOOK_BASE_URL"]) {
    if (env[key] && isForbiddenProductionWebhookHost(env[key])) {
      errors.push(`${key} must not be https://${PRODUCTION_WEBHOOK_HOSTNAME}.`);
    }
  }

  const configPath = resolveDeveloperTunnelConfigPath(projectRoot, env);
  if (requireConfig && !configPath) {
    errors.push(
      "CLOUDFLARE_TUNNEL_CONFIG is required for local developer tunnels (per-developer config file).",
    );
  }

  if (configPath) {
    const defaultProdConfig = resolve(projectRoot, "infra/cloudflare/config.yml");
    if (resolve(configPath) === resolve(defaultProdConfig)) {
      errors.push(
        "Do not use infra/cloudflare/config.yml for local integration — that is the shared/production tunnel profile. Use a per-developer config (e.g. infra/cloudflare/config.<you>.yml).",
      );
    }

    let text = configText;
    if (text == null) {
      if (!existsSync(configPath)) {
        errors.push(`Tunnel config not found: ${configPath}`);
      } else {
        text = readFileSync(configPath, "utf8");
      }
    }

    if (text != null) {
      const summary = parseCloudflaredConfigSummary(text);
      if (isForbiddenProductionTunnelName(summary.tunnelName)) {
        errors.push(`Tunnel config references production tunnel "${PRODUCTION_TUNNEL_NAME}".`);
      }
      for (const host of summary.hostnames) {
        if (isForbiddenProductionWebhookHost(host)) {
          errors.push(`Tunnel config hostname must not be ${PRODUCTION_WEBHOOK_HOSTNAME} (got ${host}).`);
        }
      }
      const httpServices = summary.services.filter((s) => /^https?:\/\//i.test(s));
      if (httpServices.length === 0) {
        errors.push("Tunnel config must ingress to an http(s) service (expected localhost:3001).");
      }
      for (const service of httpServices) {
        if (!isLocalApiServiceTarget(service, LOCAL_API_PORT)) {
          errors.push(
            `Tunnel ingress service must be ${LOCAL_API_ORIGIN} (or http://127.0.0.1:${LOCAL_API_PORT}); got ${service}.`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      [
        "LOCAL DEVELOPER TUNNEL SAFETY CHECK FAILED",
        ...errors.map((e) => `  - ${e}`),
        "",
        "See docs/operations/local-integration-tunnel.md",
      ].join("\n"),
    );
  }

  return {
    configPath,
    publicBase: resolveLocalPublicWebhookBase(env),
  };
}
