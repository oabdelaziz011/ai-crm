# Identity Platform

Unified identity routing for the Business Operating System.

## Flow

```
Unknown Visitor → Lead (create)
Known Customer → Customer (load)
Existing Lead → Lead (load)
Lead Conversion → Customer (via Shared Customer Service)
```

## Components

- `IdentityResolutionService` — resolves email/phone/conversation to lead or customer
- `ConversationIdentityResolver` — omnichannel entry point
- Login-app factory wires Lead Platform + Customer Service + conversation linking

## Rules

- Unknown contacts never create customers directly
- Lead conversion uses `CustomerServicePort` from automation-platform
- Conversation links update both `leads.conversation_id` and `conversations.lead_id`
