# VPS deployment

**Production (Contabo) uses Nginx + systemd + release directories.**  
Follow **[PRODUCTION-DEPLOY.md](./PRODUCTION-DEPLOY.md)** for the only approved production deploy and rollback procedure.

This file previously described a Compose + Caddy lab topology. That topology is **not** Contabo production and must not be used for live releases.

## Production summary (Contabo)

| Layer | Reality |
|---|---|
| Edge | Nginx + Cloudflare Origin Certificates (`/etc/nginx/ssl/origin-*.pem`) |
| API | `valueor-api.service` → `/etc/valueor/api-safe-start.sh` → `start-api.mjs` on `127.0.0.1:3001` |
| API releases | `/opt/valueor-releases/<sha>` via `/opt/valueor-current` |
| Frontend | `/var/www/valueor` → `/opt/valueor-frontend-releases/<sha>` |
| Env | `/opt/valueor/.env` (never invent secrets; OAuth flags stay OFF) |
| CI | Production gate on `ubuntu-latest`; deploy on self-hosted `valueor-production` |

Docker / Caddy / `remote-deploy.sh` are **not** the production path. Those scripts refuse when the systemd release topology is detected.

## Compose lab only (non-production)

`deploy/vps/compose.yml`, `Caddyfile*`, and `remote-deploy.sh` remain for isolated lab experiments. They require Docker and are documented only so operators do not confuse them with Contabo production.

For lab Compose:

1. Copy `deploy/vps/production.env.example` → `production.env` on the lab host.
2. Set `ACME_EMAIL` only when using the default Let's Encrypt `Caddyfile`.
3. Prefer `CADDYFILE=./Caddyfile.cloudflare` with origin PEMs when mimicking Cloudflare Full (strict).
4. Never point production DNS at a lab Compose host.

## Related docs

- [PRODUCTION-DEPLOY.md](./PRODUCTION-DEPLOY.md) — permanent Contabo deploy/rollback
- [hetzner-nginx-cutover.md](./hetzner-nginx-cutover.md) — historical Nginx cutover notes
- [backup-disaster-recovery.md](./backup-disaster-recovery.md) — backups
