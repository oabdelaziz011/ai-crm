/**
 * Resolve cloudflared CLI args for a named tunnel (never a quick tunnel).
 *
 * Precedence:
 *   1. infra/cloudflare/config.yml when present — local ingress + credentials file
 *   2. CLOUDFLARE_TUNNEL_TOKEN when config is absent — Zero Trust dashboard token
 */
export function resolveCloudflaredTunnelLaunch({
  configPath,
  configExists,
  token,
}) {
  if (configExists) {
    return {
      mode: "config",
      logMessage: `Starting named Cloudflare Tunnel using ${configPath} ...`,
      args: ["tunnel", "--config", configPath, "run"],
    };
  }

  const trimmedToken = token?.trim();
  if (trimmedToken) {
    return {
      mode: "token",
      logMessage: "Starting named Cloudflare Tunnel (token mode)...",
      args: ["tunnel", "run", "--token", trimmedToken],
    };
  }

  return null;
}
