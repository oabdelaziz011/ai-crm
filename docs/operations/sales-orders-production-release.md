# Sales Orders + AI Sales Journey — Production Release Runbook

Feature commits (preserve order; do not amend):

| SHA | Summary |
|-----|---------|
| `131da5f7` | Migrations 470/471 + Sales Orders CRM UI |
| `f70e454a` | Migration 472 + AI order tools / approval gates |
| `a0b5e3e9` | Web Chat order-tool auth + delivery short-circuit fixes |
| *(this release tip)* | Migration 473 DEFAULT role `orders.*` backfill |

**Commercial entitlement:** Sales Orders UI requires feature code `opportunities` (route registry). Customer workspace Orders tab also requires `orders.view` (+ `opportunities`). Leads follow-up remains on existing leads entitlements.

**Safe defaults (must stay true after deploy):**

- `company_order_settings.ai_order_collection_enabled` defaults **false** (no row ⇒ treated as off).
- `require_human_approval` defaults **true**.
- Public Web Chat still deny-lists CRM create/search; order tools need company AI collection explicitly enabled.

---

## Pre-deployment

1. Confirm release tip SHA contains `131da5f7` → `f70e454a` → `a0b5e3e9` → `473` migration commit.
2. Backup / DR prep per [`backup-disaster-recovery.md`](./backup-disaster-recovery.md) (Supabase automated backup / approved `pg_dump` before hosted schema changes). Do **not** invent new backup commands.
3. Verify production AI provider still uses the approved platform provider path (encrypted platform keys; no ad-hoc secret commits).
4. Confirm Web Chat production posture:
   - `PUBLIC_WEB_CHAT_API_ENABLED=true` only where public widget is intentionally live.
   - Widget origins / published AI employee already validated for any pilot company.
5. Keep `SALES_FOLLOW_UP_WORKER_ALLOW_SEND=false` unless a separate authorization explicitly enables external follow-up sends.

---

## Database

Apply hosted migrations through the **approved production migration path** (Supabase migration history / ops-approved `supabase migration up` against the production project).  

**Exact order:**

1. `470_company_order_delivery_settings.sql`
2. `471_sales_orders.sql`
3. `472_sales_orders_journey_enrichment.sql`
4. `473_sales_orders_role_permissions_backfill.sql`

**Forbidden in production:**

- `scripts/apply-470-*-local.mjs`
- `scripts/apply-471-*-local.mjs`
- `scripts/apply-472-*-local.mjs`
- `scripts/apply-473-*-local.mjs`

These scripts refuse non-local URLs by design; they are rehearsal-only.

Migration 473 is additive: it grants `orders.*` to existing `role_type = 'DEFAULT'` company roles from templates. It does **not** modify `CUSTOM` roles.

| DEFAULT `template_key` | Permissions |
|------------------------|-------------|
| `admin` | `orders.view`, `orders.create`, `orders.edit`, `orders.delete` |
| `manager` | `orders.view`, `orders.create`, `orders.edit` |
| `employee` | `orders.view` |

New companies continue receiving the same mapping via `platform_role_template_permissions` + provisioning.

---

## API / Frontend

Use the only approved Contabo path in [`PRODUCTION-DEPLOY.md`](./PRODUCTION-DEPLOY.md):

1. Merge release to `main`.
2. GitHub → Actions → **VPS deploy** → `action=deploy`, `confirm=deploy`.
3. Confirm deployed SHA on host (`/opt/valueor-current` / frontend release symlink) matches the release tip.

Do not use Compose lab `remote-deploy.sh` against Contabo systemd topology.

---

## Permissions verification

1. Existing DEFAULT admin/manager/employee roles: confirm `orders.*` matches the table above (`role_permissions` + permission catalog).
2. CUSTOM / tailored roles: confirm **unchanged** (no accidental grants).
3. New company smoke: create/provision tenant → DEFAULT roles include the same mapping from templates.
4. Commercial: company with `opportunities` entitlement can open `/dashboard/sales-orders` when RBAC allows; without entitlement, feature gate remains closed.
5. Leads / Sales Follow-up entitlements unchanged.

---

## Post-deployment verification

1. Open **Sales Orders** as a user with `orders.view`.
2. Listing, filters, numbered pagination, order details.
3. Company isolation: tenant A must not read tenant B orders/items/status events (RLS).
4. CRM customer workspace → Orders history for a customer with orders.
5. Sales Follow-up settings/jobs still load; worker with send disabled does not send external customer messages.
6. WhatsApp / Instagram / Messenger connection health and inbound/outbound smoke (no regressions expected; adapters untouched by this feature set).
7. Confirm `ai_order_collection_enabled` remains **off** by default for companies without an explicit settings row / toggle.
8. Confirm human approval remains **on** by default.
9. **Pilot only:** enable AI order collection for one approved company with catalog + delivery zones + published AI employee; create one COD order via approved channel; verify `pending_approval` / `unpaid` / human approval queue. Do not enable org-wide without sign-off.
10. Keep external follow-up / customer message sending disabled unless separately authorized.

---

## Rollback

Use the existing approved rollback only ([`PRODUCTION-DEPLOY.md`](./PRODUCTION-DEPLOY.md)):

- GitHub → Actions → **VPS deploy** → `action=rollback`, `confirm=rollback`  
  or host: `sudo -n /usr/local/sbin/valueor-prod-rollback`

That restores previous API + frontend release symlinks and restarts `valueor-api`.

**Additive migrations 470–473:** do **not** invent destructive `DROP TABLE` / reverse-permission SQL as a routine rollback. Schema stays forward-compatible; disable product surface instead:

- Leave / set `ai_order_collection_enabled = false`.
- Keep public Web Chat API / AI employee tool exposure as previously approved.
- Roll back application SHA via the approved VPS rollback if a code defect is found.

Database restore is only via the DR procedure in [`backup-disaster-recovery.md`](./backup-disaster-recovery.md) for true data incidents—not for a normal feature rollback.
