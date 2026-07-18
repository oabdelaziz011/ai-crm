# Phase 7 — WhatsApp Cloud Adapter

## Objective

First production channel adapter on the Enterprise Channel Platform using Meta WhatsApp Cloud API.

## Architecture

```
Meta Webhook → ChannelRouter.routeWebhook → WhatsAppCloudAdapter.parseWebhook
  → InboundPipeline → RuntimePort → ChannelDispatcher → WhatsAppCloudAdapter.sendOutbound
Status Webhook → ChannelRouter.routeWebhook → DeliveryStatusPipeline
```

## Configuration (`company_channels.configuration`)

| Field | Required | Description |
|-------|----------|-------------|
| `phoneNumberId` | Yes | Meta phone number ID |
| `accessToken` | Yes | Graph API bearer token |
| `verifyToken` | Yes | Webhook verification token |
| `apiVersion` | No | Default `v21.0` |
| `appSecret` | No | For signature validation (future) |

## Capabilities

- Webhook verification (`verifyWhatsAppWebhookChallenge`)
- Inbound text, button, interactive, image, audio, video, document messages
- Outbound text, template, and media messages
- Delivery status + read receipt updates via status webhooks
- Session mapping and conversation sync through existing Channel Platform pipelines

## Verification

```bash
pnpm --dir lib/channel-platform test
pnpm --dir artifacts/login-app whatsapp:e2e
```

## Out of Scope

Instagram, Messenger, Telegram, Email, CRM, Billing, Reports.
