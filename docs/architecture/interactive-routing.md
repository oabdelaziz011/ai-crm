# Interactive Routing Architecture

## Standard

All interactive customer selections (Buttons, List, and future channel interaction types) follow one routing model:

```text
Interactive Node (send_buttons / send_list)
        ↓
Selection stored in conversation.last_button_id
        ↓
Switch(conversation.last_button_id)
        ↓
Business Flow cases
```

Parallel If/Else branches wired directly from Buttons/List are **deprecated** and blocked at publish time.

## Responsibilities

| Layer | Responsibility |
| --- | --- |
| `send_buttons` / `send_list` | Render interactive UI, wait for input, persist selection variables |
| `resolveInteractiveNextNode()` | Choose the next graph node after a selection is received |
| Switch node | Evaluate `conversation.last_button_id` and route to case branches |
| Builder validation | Reject multi-branch interactive graphs without Switch routing |
| Generate Routing | Insert Switch + synchronized cases from button/list config |
| Migration tool | Convert legacy parallel If/Else graphs to Switch routing |

## Engine: `resolveInteractiveNextNode()`

Location: `lib/automation-platform/src/engine/interactive-routing.ts`

Priority order after an interactive selection:

1. **Single outgoing edge** — backwards compatible linear flows (`buttons → switch`, `buttons → if_else`, etc.)
2. **Switch router** — when an outgoing edge targets a Switch node
3. **Tagged edges** — `edge.condition.selectionId` or `edge.condition.case` matched against `conversation.last_button_id`
4. **Default edge** — explicit `case: "default"` branch
5. **Fail closed** — throws `AutomationGraphError` instead of silently executing `outgoing[0]`

Interactive action nodes do **not** embed Switch evaluation logic. Switch execution remains in `conditionNodeHandler`.

## Builder

### Validation

Publishing rejects workflows where a Buttons/List step has multiple unconditional outgoing edges without a Switch router.

Message shown to authors:

> Interactive nodes must route through a Switch node.

### Generate Routing

Available on Buttons and List property panels. Inserts:

```text
Buttons/List → Switch(conversation.last_button_id)
```

Cases are synchronized with button/list option IDs. When legacy parallel If/Else nodes exist, YES branch targets are preserved as Switch case targets.

## Migration

Script: `scripts/migrate-legacy-interactive-routing.mjs` (self-contained; plain Node.js, no TypeScript imports)

```bash
node scripts/migrate-legacy-interactive-routing.mjs --flow-id <uuid> --dry-run
node scripts/migrate-legacy-interactive-routing.mjs --flow-id <uuid>
```

```text
Buttons/List ─┬→ If/Else
              ├→ If/Else
              └→ If/Else
```

Rewrites to:

```text
Buttons/List → Switch(last_button_id) → case targets
```

## Regression: CNV-000010

The Book Appointment bug occurred because the engine always followed `outgoing[0]` to the Pricing If/Else node. Book Appointment selection never reached the Book If/Else branch.

After this architecture:

- **Book Appointment** → Switch case `book` → booking flow
- **Pricing** → Switch case `pricing` → pricing flow
- **Support** → Switch case `support` → support flow

Lists use the same field (`conversation.last_button_id` stores list row ids).

## Tests

| Area | File |
| --- | --- |
| Resolver unit tests | `lib/automation-platform/src/engine/interactive-routing.test.ts` |
| Engine integration | `lib/automation-platform/src/engine/automation-engine.test.ts` |
| Builder validation / migration | `artifacts/login-app/scripts/workflow-builder-interactive-routing.test.mts` |

Run:

```bash
pnpm --dir lib/automation-platform test
node --import tsx/esm artifacts/login-app/scripts/workflow-builder-interactive-routing.test.mts
```
