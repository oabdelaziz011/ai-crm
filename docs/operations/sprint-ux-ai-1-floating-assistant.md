# Sprint UX-AI-1 — Universal Floating AI Assistant

## Architecture

```
Every dashboard page
        ↓
FloatingAiProvider (global context + smart context switch)
        ↓
FloatingAiButton (draggable, persisted position)
        ↓
FloatingAiPanel (desktop / tablet sheet / mobile drawer)
        ↓
useFloatingAiChat → useAiChatWorkspace (shared conversation)
        ↓
Channel Platform routeInbound
        ↓
Runtime pageContext (structured metadata — NOT in user text)
        ↓
Prompt Orchestrator → Tool Router
```

### Core modules

| Module | Path | Role |
|--------|------|------|
| Types & metadata | `src/lib/floating-ai/` | Context types, runtime metadata builder, slash commands, action confirmation |
| Global context | `FloatingAiProvider` | Auto module/route/company/user; smart context switch on navigation |
| Task manager | `AiTaskProvider` | Background tasks, progress, notifications when minimized |
| Panel state | `use-ai-panel.ts` | Open/minimize/size persisted in localStorage |
| Position | `use-floating-position.ts` | Draggable button, position persisted |
| Chat | `use-floating-ai-chat.ts` | Slash commands, destructive confirmation, pageContext to runtime |
| UI | `src/components/floating-ai/` | Button, panel, context bar, quick actions, composer |

### Runtime integration

`pageContext` is added to `ChannelRuntimeConfigDto` and `RuntimeExecutionRequest`. It flows:

```
runtimeConfig.pageContext → coordinator → buildPrompt → promptContext.pageContext
```

User message text is never modified with context.

### Extension points (future-ready)

`FLOATING_AI_CAPABILITIES` flags voice, uploads, agent mode, etc. Composer exposes disabled attach/voice buttons as placeholders.

## Enterprise requirements

| Requirement | Implementation |
|-------------|----------------|
| Global context | `buildRuntimeMetadata()` — module, route, company, user, entity, rows, filters, page title |
| Entity awareness | `ContextBar` shows customer/invoice/booking/employee chips |
| Action confirmation | `action-confirmation.ts` + `ActionConfirmationDialog` for destructive patterns |
| Task progress | `AiTaskProvider` + `TaskProgressList` with live progress |
| Multi-task / minimize | Tasks continue when panel minimized; button pulse + notification count |
| Ctrl+K | Opens assistant, focuses composer (`use-floating-ai-keyboard.ts`) |
| Slash commands | `/create customer`, `/search invoice`, `/book appointment`, `/help` |
| Conversation memory | Shared `sessionStorage` conversation key per company |
| Smart context switch | Route change clears entity fields only; conversation preserved |
| Performance | Lazy panel chunk + `preloadFloatingAiAssistant()` after login |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `⌘+K` | Toggle floating AI assistant (focus input on open) |
| `Ctrl+Shift+K` / `⌘⇧K` | Command palette (page search) |
| `Escape` | Close panel |

## Accessibility

- ARIA labels on button, panel, context bar, composer
- Focus trap on desktop floating panel (Tab cycle)
- `aria-live` for background task status
- Radix Sheet/Drawer focus management on tablet/mobile
- Skip link unchanged in dashboard layout

## Responsive behavior

| Viewport | UI |
|----------|-----|
| Desktop (≥1024px) | Fixed floating panel, bottom-right |
| Tablet (768–1023px) | Right side sheet |
| Mobile (<768px) | Bottom drawer |

## Performance

- Panel code-split via `React.lazy`
- Preload triggered after auth profile loads
- No layout shift — button/panel use fixed positioning portals
- Context updates are React state only (no reflow)

## Module context registration

Pages call `useRegisterFloatingAiContext()`:

- Customers list — selected rows, filters, single customer entity
- Invoices — open invoice modal entity, totals filters
- Bookings — open booking entity
- Calendar — selected date, booking selection, filters

## AI Workspace

Sidebar entry renamed **AI Workspace** (`navigation.aiChat`). Full-page workspace retained for history, prompt library, usage — link from panel header.

## Production readiness

- [x] Runtime pageContext wired end-to-end
- [x] Permission gate (`ai_chat.view`)
- [x] Destructive action confirmation gate
- [x] Persisted panel/button state
- [x] i18n keys (EN)
- [ ] AR locale strings for `floatingAi.*` (follow-up)
- [ ] Browser screenshot evidence (manual QA)
- [ ] E2E test for Ctrl+K + context payload (follow-up)

## Test plan

1. Login → verify floating button appears on all dashboard pages
2. `Ctrl+K` → panel opens, cursor in input
3. Navigate Customers → Invoices → conversation persists, context bar updates
4. Select customers → context bar shows count + name
5. Type "delete all customers" → confirmation dialog before send
6. Type `/help` → slash hint + help response
7. Minimize during AI response → task progress visible; notification on complete
8. Tablet width → side sheet; mobile → bottom drawer
9. AI Workspace page still accessible from sidebar and panel link
