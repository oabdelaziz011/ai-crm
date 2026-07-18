# VaultOS Enterprise Demo Environment

**Environment key:** `vaultos_enterprise_v1`  
**Password (all demo users):** `DemoVault2026!`  
**Migrations:** `101_enterprise_demo_environment.sql`, `102_enterprise_demo_seed.sql`

---

## Quick start

### Apply (first time)

Migrations apply automatically via `supabase db push`. The seed runs at the end of migration `102`.

### Re-seed (idempotent — safe to run multiple times)

```sql
select public.seed_enterprise_demo_v1();
```

Or:

```bash
supabase db query --linked -f supabase/seed/enterprise-demo.sql
```

Or (with service role key in `.env`):

```bash
node scripts/seed-enterprise-demo.mjs
```

### Remove all demo data

```sql
select public.teardown_enterprise_demo_v1();
```

Or:

```bash
node scripts/teardown-enterprise-demo.mjs
```

---

## Demo companies

All companies have `company_type = 'demo'` and names prefixed with `DEMO`. Stable UUIDs use prefix `d0000010-…`.

| Company | UUID | Business state | Plan | Subscription status | Expected behavior |
|---------|------|----------------|------|---------------------|-------------------|
| **DEMO Alpha — Trial Company** | `d0000010-…000001` | Trial | Basic | `trialing` | Trial conversion UX, draft invoice, low usage, AI feature override |
| **DEMO Beta — Active Professional** | `d0000010-…000002` | Active | Pro | `active` | Full workspace + CRM + AI; upcoming renewal in ~10 days; mixed payment outcomes |
| **DEMO Gamma — Enterprise Company** | `d0000010-…000003` | Active | Enterprise | `active` | Annual billing, overdue platform invoice, sales pipeline, high AI usage |
| **DEMO Delta — Expired Company** | `d0000010-…000004` | Suspended | Pro | `expired` | Expired subscription, void/cancelled invoice, no active renewal |
| **DEMO Epsilon — Suspended Company** | `d0000010-…000005` | Suspended (company) | Pro | `active` (sub) | Admin suspension scenario; suspend + restore audit trail |

---

## Demo users & credentials

| Role | Email | UUID suffix | Company | Login behavior |
|------|-------|-------------|---------|----------------|
| **Platform Owner** | `demo-platform@vaultos.local` | `…000001` (owner) | — (super admin) | Full platform billing center, all companies, analytics |
| **Company Admin** | `demo-alpha-admin@vaultos.local` | `…000001` | Alpha | Trial company admin; workspace + billing manage |
| **Company Admin** | `demo-beta-admin@vaultos.local` | `…000002` | Beta | Primary demo admin; CRM, billing, AI |
| **Company Admin** | `demo-gamma-admin@vaultos.local` | `…000003` | Gamma | Enterprise admin |
| **Finance Manager** | `demo-finance@vaultos.local` | `…000004` | Beta | Workspace billing manage; no platform operator |
| **Employee** | `demo-employee@vaultos.local` | `…000005` | Beta | Read-only workspace billing; denied platform RPCs |
| **Support Agent** | `demo-support@vaultos.local` | `…000006` | Beta | CRM view/edit, bookings, AI chat; support queue notifications |
| **Sales Manager** | `demo-sales@vaultos.local` | `…000007` | Gamma | CRM + reports; owns won/lost/open deals |

**Password for all:** `DemoVault2026!`

---

## Available scenarios

### Financial / billing

| Scenario | Location | How to verify |
|----------|----------|---------------|
| Successful payment | Beta — `demo_pay_success_001` | Platform → Payments; status `succeeded` |
| Failed payment | Beta — `demo_pay_failed_001` | Platform → Payment Failures |
| Pending payment | Beta — `demo_pay_pending_001` | Platform → Payments; status `pending` |
| Refunded payment | Gamma — `demo_pay_refunded_001` | Payments list; status `refunded` |
| Paid invoice | `DEMO-INV-PAID-001` | Platform → Invoices |
| Draft invoice | `DEMO-INV-DRAFT-001` | Alpha draft conversion scenario |
| Overdue invoice | `DEMO-INV-OVERDUE-001` | Gamma; notification to admin |
| Issued (open) invoice | `DEMO-INV-ISSUED-001` | Gamma add-on invoice |
| Void / cancelled invoice | `DEMO-INV-VOID-001` | Delta expired company |
| Upcoming renewal | Beta subscription | Renews ~10 days; subscription event `renewal_upcoming` |
| Expired subscription | Delta | `company_subscriptions.status = expired` |
| Suspended company | Epsilon | `companies.status = Suspended` |
| Restored subscription | Epsilon | Audit + subscription events: suspend then restore |
| Sandbox mode | Platform setting | `payment_sandbox_mode = true` |
| Receipt | `DEMO-RCP-001` | Beta paid payment receipt |

### CRM (mapped to existing tables)

VaultOS does not yet have dedicated `leads`, `deals`, or `tasks` tables. Demo CRM scenarios use:

- **`customers`** — named `DEMO | {scenario} | {name}`
- **`bookings`** — activities / appointments
- **`invoices`** (CRM) — customer-level invoices
- **`demo_crm_scenarios`** — structured leads, deals, tasks, notes, activities, contacts

| Scenario | Table | Record |
|----------|-------|--------|
| Hot lead | customers + demo_crm_scenarios | Nova Retail |
| Cold lead | customers + demo_crm_scenarios | Quiet Corp |
| Won deal | customers + demo_crm_scenarios | Summit Hotels |
| Lost deal | customers + demo_crm_scenarios | Apex Labs |
| Open opportunity | customers + demo_crm_scenarios | Bright Future |
| Archived customer | customers + demo_crm_scenarios | Legacy Co |
| Tasks / notes / activities | demo_crm_scenarios | IDs `d0000200-…007` – `…009` |

### AI

| Scenario | Tables | Expected behavior |
|----------|--------|-------------------|
| AI assistants | `ai_assistant_settings` | Alpha, Beta, Gamma assistants |
| Live conversation | `conversations`, `conversation_messages` | Beta web chat with support assignment |
| Completed sales chat | `conversations` | Gamma WhatsApp, state `completed` |
| Prompt logs | `prompt_templates`, `prompt_template_versions`, `prompt_builds` | Beta conversation template v1 |
| Token usage | `ai_executions`, `ai_token_cost_records` | Beta: 538 tokens, ~$0.002 |
| AI credits / usage | `usage_records` | `ai_tokens`, `api_calls` per company |

### Notifications

| Type | Example | Read state |
|------|---------|------------|
| Billing alert | Payment failed (Beta admin) | Unread |
| Workspace alert | Usage at 82% (Beta admin) | Unread |
| System notice | New feature (Employee) | Read |
| Invoice alert | Overdue (Gamma admin) | Unread |
| Support queue | 3 tickets (Support Agent) | Unread |
| Deal won | Summit Hotels (Sales Manager) | Read |

### Analytics

- **90 days** of `financial_analytics_snapshots` with demo MRR growth, ARR, payment success rate, user/company growth
- Live snapshot via `financial_compute_analytics_snapshot_v1(current_date)` on each seed
- Company usage snapshots for Alpha, Beta, Gamma

### Other demo entities

| Entity | Table | Notes |
|--------|-------|-------|
| API keys (dummy) | `demo_api_credentials` | Prefix `vlt_demo_*`; not real secrets |
| Files / documents | `knowledge_documents` | PDF metadata only; `storage_key` under `demo/` |
| Feature flags | `company_feature_overrides`, `feature_flags` | Alpha AI boost |
| Roles / permissions | `roles`, `role_permissions`, `user_roles` | 9 demo roles |
| Audit logs | `audit_logs`, `billing_audit_logs` | Platform + billing events |
| Usage | `usage_records`, `company_usage_snapshots` | Current period metrics |

---

## Idempotency

Every demo insert uses stable UUIDs and `ON CONFLICT … DO UPDATE` or `DO NOTHING`. Running `seed_enterprise_demo_v1()` multiple times:

- Does **not** create duplicate companies, users, or payments
- **Updates** mutable fields (names, statuses, metrics) to canonical demo values
- **Refreshes** 90-day analytics history

---

## Safe removal

`teardown_enterprise_demo_v1()` deletes demo data in FK-safe order:

1. Conversations, AI artifacts, knowledge docs  
2. CRM customers/bookings/invoices (demo users)  
3. Billing artifacts, subscriptions, roles  
4. Demo companies and auth users (`d0000001…`, `d0000002…000001–007`)  
5. Registry + manifest timestamp  

Does **not** delete production companies or non-demo users.

---

## Demo data markers

All demo records include one or more of:

- Company `company_type = 'demo'`
- Name/title prefix `DEMO`
- JSON metadata: `{"demo": true, "demo_env": "vaultos_enterprise_v1", "is_demo_data": true}`
- Email domain `@vaultos.local`
- Stable UUID prefix `d000…`

---

## UUID map (reference)

| Block | Purpose |
|-------|---------|
| `d0000001-…` | Platform owner |
| `d0000002-…000001–007` | Demo personas |
| `d0000010-…000001–005` | Demo companies |
| `d0000020-…` | Subscriptions |
| `d0000030-…` | Roles |
| `d0000040-…` | Billing payments |
| `d0000050-…` | Billing invoices |
| `d0000060-…` | Receipts |
| `d0000070-…` | Payment methods |
| `d0000080-…` | Billing contacts |
| `d0000090-…` | Billing audit logs |
| `d00000a0-…` | Usage records |
| `d00000b0-…` | Usage snapshots |
| `d00000c0-…` | Subscription events |
| `d00000d0-…` | CRM customers |
| `d00000e0-…` | Bookings / activities |
| `d00000f0-…` | CRM invoices |
| `d0000100-…` | AI assistants |
| `d0000110-…` | Conversations |
| `d0000120-…` | Conversation participants |
| `d0000130-…` | Conversation messages |
| `d0000140-…` | AI executions |
| `d0000150-…` / `0151` / `0152` | Prompt templates / versions / builds |
| `d0000160-…` / `0161` | AI traces / token costs |
| `d0000170-…` / `0171` | Knowledge sources / documents |
| `d0000180-…` | Notifications |
| `d0000190-…` | Audit logs |
| `d0000200-…` | CRM scenarios |
| `d0000210-…` | Demo API credentials |

---

## Schema limitations (honest mapping)

These requested entities **do not have dedicated tables** yet; demo data maps as follows:

| Requested | Demo implementation |
|-----------|---------------------|
| Leads | `demo_crm_scenarios` + `customers` |
| Deals | `demo_crm_scenarios` + CRM `invoices` |
| Contacts | `demo_crm_scenarios` + `company_billing_contacts` + `customers` |
| Activities | `bookings` + `demo_crm_scenarios` |
| Notes / tasks | `demo_crm_scenarios` |
| API keys | `demo_api_credentials` (demo-only table) |
| Files | `knowledge_documents` metadata |
| Cancelled invoices | `billing_invoices.status = void` |

When native CRM tables are added in a future phase, migrate demo seed to target those tables while keeping the same UUID scheme.

---

## Demo Scenario Switcher (Platform Owner UI)

**Route:** `/dashboard/demo-scenarios` (super admin only)

Platform Owners can reset or switch scenarios from the UI — no manual SQL.

| Code | Scenario | Suggested login |
|------|----------|-----------------|
| `healthy_company` | A — Healthy Company | `demo-beta-admin@vaultos.local` |
| `payment_failed` | B — Payment Failed | `demo-beta-admin@vaultos.local` |
| `subscription_expired` | C — Subscription Expired | `demo-beta-admin@vaultos.local` |
| `company_suspended` | D — Company Suspended | `demo-beta-admin@vaultos.local` |
| `enterprise_customer` | E — Enterprise Customer | `demo-gamma-admin@vaultos.local` |
| `heavy_crm_data` | F — Heavy CRM Data | `demo-beta-admin@vaultos.local` |
| `empty_workspace` | G — Empty Workspace | `demo-beta-admin@vaultos.local` |

**RPCs (also callable from SQL):**

```sql
select public.switch_enterprise_demo_scenario_v1('payment_failed');
select public.reset_enterprise_demo_v1();
select public.list_enterprise_demo_scenarios_v1();
select public.get_enterprise_demo_status_v1();
```

Each switch runs full `seed_enterprise_demo_v1()` then applies the scenario overlay.

---

## Related files

| File | Purpose |
|------|---------|
| `supabase/migrations/101_enterprise_demo_environment.sql` | Registry, staging tables, teardown |
| `supabase/migrations/103_demo_scenario_switcher.sql` | Scenario switch RPCs + UI backend |
| `supabase/seed/enterprise-demo.sql` | One-line re-seed script |
| `scripts/seed-enterprise-demo.mjs` | Node re-seed helper |
| `scripts/teardown-enterprise-demo.mjs` | Node teardown helper |
| `scripts/enterprise-e2e-verify.mjs` | Automated persona verification |
