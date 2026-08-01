# Phase 8 — Enterprise SaaS Product

## Objective

Transform the completed AI platform (Runtime, Channel Platform, WhatsApp adapter, Knowledge, Observability) into a production-ready multi-tenant SaaS experience in the login-app dashboard.

## Architecture Boundaries (Preserved)

| Concern | Entry point | Notes |
|---------|-------------|-------|
| AI execution | Runtime Coordinator | SaaS UI never calls runtime directly except via existing AI Chat workspace |
| Outbound messaging | Channel Platform `dispatcher` | Omnichannel Console human replies use `ChannelDispatcher`, not runtime |
| Channel config | Channel Registry | Channel Administration UI |
| Conversations | Conversation Engine | Omnichannel list, thread, assign/release/close |
| Observability | AI Observability services | Usage & Cost, Analytics pages |
| Billing / CRM / RBAC | Existing modules | Wired via dashboard routes and permissions |

```
Customer message → Channel Platform → Runtime (AI reply)
Team agent reply → Conversation Engine + Channel Dispatcher → Channel Adapter

SaaS UI reads/writes:
  conversations.*     → Conversation Engine
  channels.*          → Channel Registry
  ai.costs/analytics  → AI Observability
  CRM pages           → Supabase hooks (existing)
  billing             → Billing nest (existing)
```

## SaaS Surfaces (Priority Order)

| # | Surface | Route | Permission |
|---|---------|-------|------------|
| 1 | Omnichannel Console | `/dashboard/omnichannel` | `ai.conversations.view` |
| 2 | Conversation Management | Omnichannel Console actions | `ai.conversations.reply`, `.takeover`, `.release` |
| 3 | CRM Workspace | customers, bookings, invoices | existing CRM permissions |
| 4 | AI Assistant Admin | `/dashboard/ai-assistant` | `ai_assistant.view` |
| 5 | Knowledge Administration | `/dashboard/knowledge` | `knowledge.view` |
| 6 | Channel Administration | `/dashboard/channels` | `channels.view` / `channels.manage` |
| 7 | Usage & Cost Dashboard | `/dashboard/ai-usage` | `ai.costs.view` |
| 8 | Analytics & Reporting | `/dashboard/ai-analytics`, reports AI links | `ai.analytics.view` |
| 9 | Subscription & Billing | `/dashboard/subscriptions`, workspace | billing permissions |
| 10 | Multi-tenant admin | users, roles, companies, audit-logs | existing RBAC |

## Key Implementation Files

| Area | Path |
|------|------|
| Route registry | `artifacts/login-app/src/config/dashboard-route-registry.ts` |
| Omnichannel Console | `pages/dashboard/conversations/omnichannel-console-page.tsx` |
| Channel admin | `pages/dashboard/channels/channels-page.tsx` |
| AI Usage | `pages/dashboard/ai/ai-usage-page.tsx` |
| AI Analytics | `pages/dashboard/ai/ai-analytics-page.tsx` |
| Conversation hooks | `hooks/conversations/*` |
| Channel admin hooks | `hooks/channels/use-company-channels-admin.ts` |
| Observability hooks | `hooks/ai-observability/*` |

## WhatsApp Configuration

Channel Administration stores WhatsApp Cloud credentials in `company_channels.configuration`:

- `phoneNumberId`, `accessToken`, `verifyToken` (required)
- `apiVersion` (optional, default `v21.0`)

Legacy `/dashboard/whatsapp` redirects to Omnichannel Console.

## Sidebar Structure

**AI Platform** group (top priority):

- Omnichannel Console, Channels, AI Assistant, AI Chat, Knowledge, AI Usage & Cost, AI Analytics

CRM, billing, user management, and settings remain as top-level or grouped routes.

## Verification

```bash
pnpm --dir artifacts/login-app typecheck
pnpm --dir artifacts/login-app build
pnpm --dir artifacts/login-app channel:e2e
pnpm --dir artifacts/login-app whatsapp:e2e
```

Manual checks:

1. Omnichannel Console loads conversations; filters (all/unread/mine) work
2. Human reply persists message and dispatches when `channel_sessions` exists
3. Channel create/configure saves WhatsApp credentials
4. AI Usage and Analytics show observability data for tenant
5. AI Assistant Integrations tab links to Channels, Omnichannel Console, Knowledge, Analytics

## Out of Scope

- New channel adapters (Instagram, Messenger, Telegram, Email)
- Backend service redesign
- Direct runtime invocation from new SaaS pages

Future channels plug in as Channel Adapters with minimal SaaS changes (Channel Administration + Omnichannel Console already channel-agnostic).
