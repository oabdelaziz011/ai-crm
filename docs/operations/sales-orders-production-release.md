# Sales Orders + Delivery + Cancellation + Login — Production Release Runbook

Feature commits on `feat/sales-order-delivery-settings` (preserve order; do not amend):

| SHA | Summary |
|-----|---------|
| `131da5f7` | Migrations 470/471 + Sales Orders CRM UI |
| `f70e454a` | Migration 472 + AI order tools / approval gates |
| `a0b5e3e9` | Web Chat order-tool auth + delivery short-circuit fixes |
| `de568251` | Migration 473 DEFAULT role `orders.*` backfill + initial runbook |
| `27b46e77` | Migrations 474–477 + delivery assignment / workers / audit notify |
| *(478 commit)* | Migration 478 `orders.assign_delivery` backfill for eligible CUSTOM/system roles |
| `2280f16f` | Migrations 479–480 + customer cancellation workflow |
| `29825d39` | Login experience (client-side attempt throttle UX + compact layout) |

**Commercial entitlement:** Sales Orders UI requires feature code `opportunities` (route registry). Customer workspace Orders tab also requires `orders.view` (+ `opportunities`). Leads follow-up remains on existing leads entitlements.

**Safe defaults (must stay true after deploy):**

- `company_order_settings.ai_order_collection_enabled` defaults **false** (no row ⇒ treated as off).
- `require_human_approval` defaults **true**.
- Public Web Chat still deny-lists CRM create/search; order tools need company AI collection explicitly enabled.
- Login rate limiter is **browser `sessionStorage` only** — not server-side auth security. Supabase Auth provider limits remain authoritative.

---

## Pre-deployment

1. Confirm release tip contains the full commit chain above (through Login + 478).
2. **Backup:** Supabase dashboard on-demand backup for the **production** project. Record backup id + UTC + completed status per [`backup-disaster-recovery.md`](./backup-disaster-recovery.md). Do **not** invent new backup commands.
3. **Hosted migration inventory (read-only):** `supabase migration list --linked` (or dashboard) against the intended production project. Record highest version and presence/absence of `470`–`480`.
4. Verify production AI provider still uses the approved platform provider path (encrypted platform keys; no ad-hoc secret commits).
5. Confirm Web Chat production posture:
   - `PUBLIC_WEB_CHAT_API_ENABLED=true` only where public widget is intentionally live.
   - Widget origins / published AI employee already validated for any pilot company.
6. Keep `SALES_FOLLOW_UP_WORKER_ALLOW_SEND=false` unless a separate authorization explicitly enables external follow-up sends.

---

## Database

Apply hosted migrations through the **approved production migration path** (Supabase migration history / ops-approved `supabase migration up` against the production project).

**Exact order (additive / expand-first):**

1. `470_company_order_delivery_settings.sql`
2. `471_sales_orders.sql`
3. `472_sales_orders_journey_enrichment.sql`
4. `473_sales_orders_role_permissions_backfill.sql`
5. `474_update_my_profile_allow_german.sql`
6. `475_delivery_workers_and_order_enrichment.sql`
7. `476_delivery_zone_aliases_and_assignment_mode.sql`
8. `477_delivery_assignment_audit_and_notify.sql`
9. `478_orders_assign_delivery_role_backfill.sql`
10. `479_sales_order_customer_cancellation.sql`
11. `480_cancellation_notification_idempotency.sql`

**Compatibility:** Prefer apply **470–480 before** merging/deploying application code that depends on these tables/columns. Old `main` app code can generally run against additive schema; new cancel/delivery code must not go live without matching schema.

**Migration 478:** Additive RBAC only. Reaffirms DEFAULT admin/manager `orders.assign_delivery` from 475 and extends grants to eligible company system admins (`is_system` + `orders.edit`) and roles that already have full orders CRUD but lack assign. Does **not** grant every role. Does **not** touch PLATFORM roles. Cancellation (479/480) does **not** require 478 at the SQL level; delivery-assign UI for CUSTOM demos does.

**Forbidden in production:**

- All `scripts/apply-470-*` … `scripts/apply-480-*-local.mjs` (and `_lib-apply-migration-local.mjs`)

These scripts refuse non-local URLs by design; they are rehearsal-only.

Migration 473 is additive: it grants `orders.*` to existing `role_type = 'DEFAULT'` company roles from templates. It does **not** modify `CUSTOM` roles (478 covers selected CUSTOM/system cases for assign only).

| DEFAULT `template_key` | Permissions |
|------------------------|-------------|
| `admin` | `orders.view`, `orders.create`, `orders.edit`, `orders.delete`, `orders.assign_delivery`, `orders.approve_cancellation` (via later migrations/templates) |
| `manager` | `orders.view`, `orders.create`, `orders.edit`, `orders.assign_delivery`, `orders.approve_cancellation` |
| `employee` | `orders.view` |

New companies continue receiving template mappings via `platform_role_template_permissions` + provisioning.

---

## API / Frontend

Use the only approved Contabo path in [`PRODUCTION-DEPLOY.md`](./PRODUCTION-DEPLOY.md):

1. Merge release to `main`.
2. GitHub → Actions → **VPS deploy** → `action=deploy`, `confirm=deploy`.
3. Confirm deployed SHA on host (`/opt/valueor-current` / frontend `version.json`) matches the release tip.
4. Optional pre-check: **Contabo FE readonly verify** workflow (`confirm=readonly-verify`) — does not change production.

Do not use Compose lab `remote-deploy.sh` against Contabo systemd topology.

**VPS deploy does not apply database migrations.** Schema must already be at 470–480 (or applied in the same release window before traffic hits new code paths).

---

## Permissions verification

1. Existing DEFAULT admin/manager/employee roles: confirm `orders.*` matches the intended matrix (`role_permissions` + permission catalog).
2. After 478: CUSTOM/system admins with `orders.edit` (or full CRUD) should have `orders.assign_delivery` when eligible; PLATFORM roles unchanged.
3. After 479: admin/manager templates include `orders.approve_cancellation`.
4. New company smoke: provision tenant → DEFAULT roles include the same mapping from templates.
5. Commercial: company with `opportunities` entitlement can open `/dashboard/sales-orders` when RBAC allows; without entitlement, feature gate remains closed.
6. Leads / Sales Follow-up entitlements unchanged.

---

## Post-deployment verification

1. Open **Sales Orders** as a user with `orders.view`.
2. Listing, filters, numbered pagination, order details.
3. Company isolation: tenant A must not read tenant B orders/items/status events (RLS).
4. CRM customer workspace → Orders history for a customer with orders.
5. Delivery workers/zones settings; assign delivery when permitted.
6. Sales Follow-up settings/jobs still load; worker with send disabled does not send external customer messages.
7. WhatsApp / Instagram / Messenger connection health and inbound/outbound smoke (no regressions expected).
8. Confirm `ai_order_collection_enabled` remains **off** by default for companies without an explicit settings row / toggle.
9. Confirm human approval remains **on** by default.
10. **Cancellation:** AI policy tools available only with trusted customer identity; direct cancel vs request paths; employee approve/reject; notifications idempotent; cancelled orders not assignable.
11. **Login:** page loads; success/failure; redirects; client throttle UX only; mobile/desktop layout.
12. **Pilot only:** enable AI order collection for one approved company; do not enable org-wide without sign-off.
13. Keep external follow-up / customer message sending disabled unless separately authorized.
14. Do not send real WhatsApp cancel/assignment messages unless a safe test recipient is approved.

---

## Rollback

Use the existing approved rollback only ([`PRODUCTION-DEPLOY.md`](./PRODUCTION-DEPLOY.md)):

- GitHub → Actions → **VPS deploy** → `action=rollback`, `confirm=rollback`  
  or host: `sudo -n /usr/local/sbin/valueor-prod-rollback`

That restores previous API + frontend release symlinks and restarts `valueor-api`.

**Additive migrations 470–480:** do **not** invent destructive `DROP TABLE` / reverse-permission SQL as a routine rollback. Schema stays forward-compatible; disable product surface instead:

- Leave / set `ai_order_collection_enabled = false`.
- Keep public Web Chat API / AI employee tool exposure as previously approved.
- Roll back application SHA via the approved VPS rollback if a code defect is found.
- Forward-fix permissions or feature flags if a migration side effect is found.

Database restore is only via the DR procedure in [`backup-disaster-recovery.md`](./backup-disaster-recovery.md) for true data incidents—not for a normal feature rollback.
