# Sprint 10.0 — Enterprise Agent Workspace V2 UX Audit

**Date:** 2026-08-01  
**Scope:** Complete presentation rebuild. Business logic unchanged.

---

## Architecture

```
OmnichannelConsolePage (fixed inset-0, full viewport)
└── OmnichannelConsole
    ├── AgentWorkspace (workspace-v2)
    │   ├── WorkspaceTopBar (48–52px)
    │   ├── WorkspaceNavRail (permanent icon column)
    │   ├── InboxColumn (340px, always visible)
    │   ├── ConversationPane (flex ~70%)
    │   └── Customer360Sidebar (340px, collapsible, NOT overlay)
    ├── EscalationSheet (existing)
    ├── AssignmentSheet (existing)
    ├── LinkCustomerDialog (existing)
    └── CustomerModal (existing)
```

**Removed from render path:** `AgentDeskShell`, `QueuePanel`, `InsightPanel` overlay, `CommandDeck`, toggle queue drawer.

---

## Empty Space Audit

| Area | Status | Notes |
|------|--------|-------|
| Dashboard padding around workspace | **Fixed** | Page uses `fixed inset-0` — no double padding |
| Queue toggle dead zone | **Fixed** | Inbox column always visible |
| Customer 360 overlay scrim | **Fixed** | Permanent right column |
| Empty inbox early return | **Fixed** | Workspace renders with empty list + empty state in column |
| Conversation empty state | **OK** | Center pane CTA text only, no giant art |
| Transcript side margins | **Improved** | CSS forces full width in workspace |
| Top bar height | **OK** | 52px (`--ws-top-height`) |

**Remaining minor gaps:**
- Collapsed Customer 360 shows 40px strip on desktop — intentional
- Mobile hides one column at a time — by design

---

## Untranslated Labels

All workspace chrome uses `omnichannel.workspace.*` keys with **Arabic parity** in `locales/ar/common.json`.

| Key area | Status |
|----------|--------|
| Nav rail (8 queues) | ✅ AR + EN |
| Top bar settings/notifications | ✅ AR + EN |
| Customer 360 collapse/expand | ✅ AR + EN |
| Actions toolbar | ✅ via existing `omnichannel.actions.*` |
| Composer | ✅ via existing `omnichannel.composer.*` |

**Known English fallbacks (conversation content only — allowed):**
- Customer message bodies
- AI-detected language label when backend returns English name
- Channel keys if missing from `omnichannel.channels.*`

**Lifecycle states:** use `omnichannel.lifecycle.*` — verify AR keys exist ✅

---

## Dead Buttons Audit

| Control | Status |
|---------|--------|
| Reply / Send | ✅ Works |
| Assign / Transfer | ✅ Opens AssignmentSheet |
| Take Over / Return to AI | ✅ Lifecycle wired |
| Escalate | ✅ Opens EscalationSheet |
| Resolve / Close / Reopen | ✅ Lifecycle wired |
| Internal Note | ✅ Composer mode toggle |
| AI Assist toolbar | ✅ Opens Customer 360 + scroll |
| Translate (toolbar) | ⚠️ Toast preview (backend N/A) |
| Emoji | ✅ Popover picker |
| Attachments / Voice / Templates / AI Rewrite / Translate / Mention (composer) | ✅ **Disabled** with tooltip (not dead) |
| Create / Link Customer | ✅ Opens modal/dialog |
| Queue hover Assign/Take over/Escalate | ✅ Wired |
| Settings | ✅ Navigates to `/settings` |
| Notifications | ✅ NotificationBell |

---

## Placeholder Values

| Field | Handling |
|-------|----------|
| Unknown contact | `resolveContactDisplayName` → Visitor #### |
| Empty priority normal/low | Hidden in header chips |
| Empty CRM metrics | Shows `0` or `—` (notAvailable) |
| Empty AI summary | Shows notAvailable string |
| Empty timeline/notes | Localized empty label |

---

## Hidden Actions Audit

| Requirement | Status |
|-------------|--------|
| All primary lifecycle actions visible | ✅ Horizontal toolbar, scroll if needed |
| More menu | ✅ Only return/cancel escalation |
| Queue actions on hover | ✅ Visible on row hover |

---

## Queue Behavior

| Requirement | Status |
|-------------|--------|
| Never navigates away | ✅ Same route, filter-only |
| Never popup | ✅ Inbox column permanent |
| Conversation stays open | ✅ selectedId preserved on nav change |

---

## Responsive

| Breakpoint | Behavior |
|------------|----------|
| Desktop | Nav + 340px inbox + flex center + 340px Customer 360 |
| Tablet (<1024px) | Customer 360 hidden (`max-lg:hidden`), collapse strip |
| Mobile (<768px) | List OR conversation toggle via layout state |

---

## Performance

- Inbox: virtualized via `computeConversationListWindow` + 52px rows
- Transcript: virtualized via `computeMessageListWindow`
- Customer 360: lightweight sections, no overlay portal
- No AgentDeskShell / duplicate queue mounts

---

## Files Added

`components/omnichannel/workspace-v2/` — full module (shell, nav, inbox, conversation, customer360, CSS, layout hook, nav mapping)

## Files Modified

- `omnichannel-console.tsx` — wires `AgentWorkspace`
- `omnichannel-console-page.tsx` — full-bleed viewport
- `omnichannel/index.ts` — export workspace
- `use-omnichannel-labels.ts` — workspace label hooks
- `locales/en/common.json`, `locales/ar/common.json` — workspace keys
- `compose-panel.tsx` — disabled preview tools

## Deprecated (not mounted)

`components/omnichannel/agent-desk/*` — retained for reference, **not imported by console**

---

## Validation

- `npm run typecheck` — ✅ Pass
- `npm run build` — ✅ Pass

---

## Enterprise Readiness: **8.5/10**

Production-ready three-column workspace. Remaining gap: composer media/AI backend integration (disabled states in place).
