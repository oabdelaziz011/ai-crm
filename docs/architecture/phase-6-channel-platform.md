# Phase 6 — Enterprise Channel Platform

## Objective

Provider-independent communication layer integrating all messaging channels with the Conversation Engine and Enterprise Runtime.

## Architecture Boundaries

```
Incoming: Webhook/Direct UI → ChannelRouter → InboundPipeline → ConversationEngine + RuntimePort → OutboundPipeline → ChannelDispatcher → ChannelAdapter
```

| Component | Responsibility |
|-----------|----------------|
| **Channel Registry** (`@workspace/channel-registry`) | Catalog + tenant channel connections (persistence only) |
| **Channel Adapter** | Provider-specific normalize/format/send — no runtime access |
| **Channel Router** | Single inbound entry point |
| **Inbound Message Pipeline** | Session resolution, idempotency, optional runtime trigger |
| **Channel Runtime Port** | Wraps Enterprise Runtime Coordinator (no direct engine access) |
| **Outbound Message Pipeline** | Delivery record + adapter dispatch |
| **Channel Dispatcher** | Single outbound entry point |
| **Conversation Engine** | Owns conversations and messages |
| **Runtime Coordinator** | Owns AI execution |

## Package Structure

```
lib/channel-platform/
  src/
    adapters/          # StubWebChatAdapter + registry
    dispatcher/        # ChannelDispatcher
    dto/               # Common DTOs and event contracts
    engines/           # Session, delivery tracking, attachments
    pipelines/         # Inbound + outbound pipelines
    ports/             # Adapter, registry, conversation, runtime ports
    repositories/      # Supabase persistence
    router/            # ChannelRouter
```

## Persistence (Migration 108)

- `channel_sessions` — external thread → conversation binding
- `channel_inbound_events` — idempotent inbound event log
- `channel_delivery_events` — outbound delivery lifecycle

## App Wiring

- `artifacts/login-app/src/lib/channel-platform/` — port adapters + `useChannelPlatformServices`
- AI Chat workspace routes sends through `ChannelRouter.routeInbound()` (no direct runtime calls)

## Permissions

- `channel.platform.view`
- `channel.platform.route`
- `channel.platform.dispatch`

## Out of Scope (Phase 6)

WhatsApp Cloud API, Instagram, Messenger, Email, CRM, Billing, Reports.

## Verification

```bash
pnpm --dir lib/channel-platform test
pnpm --dir artifacts/login-app channel:e2e
```

E2E demonstrates: incoming event → session resolution → runtime execution → outbound dispatch → delivery tracking.
