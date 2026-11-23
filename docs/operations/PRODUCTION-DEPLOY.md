# Production deploy (Contabo) — permanent procedure

**This is the only approved production deployment path.**

## Permanent architecture

```
Internet → Cloudflare (proxied HTTPS)
  → Contabo Nginx (Cloudflare Origin Certificates at /etc/nginx/ssl/origin-*.pem)
      → /var/www/valueor  →  /opt/valueor-frontend-releases/<sha>   (symlink)
      → 127.0.0.1:3001    ←  valueor-api.service
                              WorkingDirectory=/opt/valueor-current
                              /opt/valueor-current → /opt/valueor-releases/<sha>
                              EnvironmentFile=/opt/valueor/.env
                              ExecStart=/bin/bash /etc/valueor/api-safe-start.sh
```

- Docker, Docker Compose, and Caddy are **not** production.
- Do not overwrite the custom live unit with `deploy/vps/systemd/valueor-api.service`.
- Do not invent `ACME_EMAIL` or `ALERT_WEBHOOK_URL`.
- OAuth / Embedded Signup feature flags stay OFF until deliberately enabled.

## One-time host prep (after merging this deploy system)

1. Update `/opt/valueor` to the merged main SHA (clean worktree).
2. Install restricted wrappers (root-owned, mode 0750):

```bash
sudo install -m 0750 -o root -g root \
  /opt/valueor/deploy/vps/valueor-prod-deploy.sh /usr/local/sbin/valueor-prod-deploy
sudo install -m 0750 -o root -g root \
  /opt/valueor/deploy/vps/valueor-prod-rollback.sh /usr/local/sbin/valueor-prod-rollback
```

3. Keep `gha-runner` sudoers limited to those two commands (`NOPASSWD`), no unrestricted sudo, no SSH `0.0.0.0/0`.
4. Confirm Origin certificates and `/opt/valueor/.env` are untouched.

## Single production entry points

| Action | Only approved entry |
|---|---|
| Deploy (API + frontend) | `.github/workflows/vps-deploy.yml` → `sudo -n /usr/local/sbin/valueor-prod-deploy` |
| Rollback | `.github/workflows/vps-deploy.yml` → `sudo -n /usr/local/sbin/valueor-prod-rollback` |

`frontend-production-artifact.yml` is **build-only** (artifact upload). It must never SSH/SCP to Contabo or call publish helpers. There is no separate frontend publish workflow.

## Deploy (every release)

1. Merge the release to `main`.
2. GitHub → Actions → **VPS deploy** → `action=deploy`, `confirm=deploy`.
3. Flow:
   - `guard` + `production-gate` on `ubuntu-latest`
   - `build` API + frontend artifacts on `ubuntu-latest`
   - `deploy` on self-hosted `[self-hosted, linux, x64, valueor-production]`
   - `sudo -n /usr/local/sbin/valueor-prod-deploy <sha> <incoming-artifacts>`
4. The deploy script:
   - validates `/opt/valueor/.env` with `--topology nginx-systemd` (no ACME required)
   - backs up safe-start + deploy-state
   - installs `/opt/valueor-releases/<sha16>` and `/opt/valueor-frontend-releases/<sha16>`
   - writes systemd drop-in `WorkingDirectory=/opt/valueor-current` (does not replace the unit)
   - rewrites **only** the `exec` line in `/etc/valueor/api-safe-start.sh`
   - flips `/opt/valueor-current` and `/var/www/valueor` (+ `.previous`)
   - restarts **only** `valueor-api.service`
   - health-checks local `:3001` and Nginx Host-header HTTPS
   - auto-rollbacks on failure

## Rollback

GitHub → Actions → **VPS deploy** → `action=rollback`, `confirm=rollback`

or on the host:

```bash
sudo -n /usr/local/sbin/valueor-prod-rollback
```

Restores previous API + frontend release symlinks and restarts `valueor-api`.

## Non-production Compose lab

`deploy/vps/remote-deploy.sh` / `remote-rollback.sh` remain for documented Compose lab use only. They **refuse** to run when Contabo systemd release topology is detected.
