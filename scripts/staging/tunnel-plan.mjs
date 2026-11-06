/** Arguments for a temporary Cloudflare quick tunnel. No token and no Production hostname. */

const PRODUCTION_HOSTS = ["api.valueor.org", "app.valueor.org", "webhook.valueor.org"];

export function stagingTunnelPlan(port) {
  const listenPort = Number(port);
  if (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535 || listenPort === 3000) {
    throw new Error("Staging tunnel port must be an unused local port other than 3000.");
  }
  return {
    args: ["tunnel", "--url", `http://127.0.0.1:${listenPort}`, "--no-autoupdate"],
    forbiddenHosts: PRODUCTION_HOSTS,
  };
}

export function stagingTunnelAllowsPrintedHost(hostname) {
  const host = String(hostname ?? "").trim().toLowerCase();
  if (!host.endsWith(".trycloudflare.com")) return false;
  return !PRODUCTION_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

export function stagingTunnelChildEnv(env) {
  const next = { ...env };
  delete next.CLOUDFLARE_TUNNEL_TOKEN;
  delete next.CLOUDFLARE_TUNNEL_CONFIG;
  delete next.CLOUDFLARE_TUNNEL_ID;
  return next;
}
