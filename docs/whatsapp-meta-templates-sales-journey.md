# Meta WhatsApp templates required for ValueOR sales journey

**Do not claim a template is approved until Meta Business Manager shows status APPROVED on the company WABA.**

Currently verified on production WABA (as of last audit): only `hello_world` (en_US, UTILITY) is APPROVED. `generic_system` does **not** exist and must not be used.

## Meta dashboard actions

1. Open **Meta Business Suite → WhatsApp Manager → Message templates** for WABA `ValueOR` (phone number id used by company channel).
2. For each row below, **Create template**:
   - Category: **Utility**
   - Language: as listed (start with `English (US)` / `en_US`; add Arabic later if needed)
   - Header: None (unless noted)
   - Body: copy the body text exactly (including `{{n}}` placeholders)
   - Footer: optional
3. Submit for Meta review. Wait until status is **Approved**.
4. In ValueOR, set `company_whatsapp_settings.template_bindings` (migration `482`) for each purpose:

```json
{
  "connection_test": {
    "metaName": "hello_world",
    "language": "en_US",
    "approvalStatus": "approved"
  },
  "delivery_worker_dispatch": {
    "metaName": "valueor_delivery_worker_dispatch",
    "language": "en_US",
    "approvalStatus": "approved"
  }
}
```

Set `approvalStatus` to `approved` **only after** Meta shows APPROVED. Never set it from guesswork.

5. Do **not** use `hello_world` for worker or customer order updates.
6. Do **not** create or rely on `generic_system` / `generic_system_ar` for transactional traffic.

## Templates to create

| Purpose | Recommended Meta name | Language | Category | Recipient | Body | Variables (examples) |
|---|---|---|---|---|---|---|
| connection_test | `hello_world` (existing) | en_US | UTILITY | customer | Meta default Hello World | none |
| delivery_worker_dispatch | `valueor_delivery_worker_dispatch` | en_US | UTILITY | **worker** | `New delivery assignment {{1}}. Customer {{2}}. Address {{3}}. Phone {{4}}. Total {{5}}.` | SO-20261128-001 / Omar / Nasr City, Cairo / +2010… / 125 EGP |
| delivery_worker_cancellation | `valueor_delivery_worker_cancellation` | en_US | UTILITY | **worker** | `Delivery cancelled for order {{1}}. Customer {{2}}. Do not deliver.` | SO-… / Omar |
| customer_order_status_pending_approval | `valueor_order_pending_approval` | en_US | UTILITY | customer | `Hi {{1}}, we received order {{2}}. It is pending team approval. We will update you once it is confirmed.` | Omar / SO-… |
| customer_order_status_confirmed | `valueor_order_confirmed` | en_US | UTILITY | customer | `Hi {{1}}, order {{2}} is confirmed. We are preparing it for delivery.` | Omar / SO-… |
| customer_order_status_processing | `valueor_order_processing` | en_US | UTILITY | customer | `Hi {{1}}, order {{2}} is now being processed.` | Omar / SO-… |
| customer_order_status_out_for_delivery | `valueor_order_out_for_delivery` | en_US | UTILITY | customer | `Hi {{1}}, order {{2}} is out for delivery.` | Omar / SO-… |
| customer_order_status_delivered | `valueor_order_delivered` | en_US | UTILITY | customer | `Hi {{1}}, order {{2}} has been marked delivered. Thank you.` | Omar / SO-… |
| customer_order_status_cancelled | `valueor_order_cancelled` | en_US | UTILITY | customer | `Hi {{1}}, order {{2}} has been cancelled. If you have questions, reply here.` | Omar / SO-… |

## Runtime behavior after this fix

| Path | Inside Meta 24h customer window | Outside window |
|---|---|---|
| AI Employee replies (channel platform) | Freeform `type: text` | Meta rejects freeform until customer inbound |
| Customer order status | Freeform `type: text` | Approved purpose template (or explicit config error) |
| Worker assignment / cancel | Always purpose template (worker is not in customer session) | Same |
| `/whatsapp/send-text` | Requires `sessionWindowOpen: true`; sends freeform | Rejected with `session_window_closed_no_template` |
| Queue `generic_system` | Blocked (`generic_system_blocked`) | Blocked |

No Email fallback on these paths.

## AI Flow published snapshot

Runtime WhatsApp tools come from the **live** `ai_employees.allowed_tool_keys` row, not `ai_employee_versions.snapshot`. If the published snapshot lists older tools while the live row has sales tools, republish (or save tools again — auto-sync creates a new published version). Until then, runtime still uses the live sales tools.
