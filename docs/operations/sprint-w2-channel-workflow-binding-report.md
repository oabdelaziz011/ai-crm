# Sprint W2 — Portal UI for Channel ↔ Workflow Binding

**Branch:** `cursor/workflow-builder-canvas-sync-fix`  
**Date:** 2026-07-23

## Goal

Allow administrators to assign an Automation Workflow to a WhatsApp channel from the Portal (`/dashboard/channels`).

---

## Implementation Summary

### Modified React components

| File | Change |
|------|--------|
| `artifacts/login-app/src/pages/dashboard/channels/channels-page.tsx` | Configure dialog integrates workflow binding save + toasts |
| `artifacts/login-app/src/components/channels/channel-workflow-binding-section.tsx` | **New** — toggle, dropdown, helper text |

### New hooks & repository

| File | Purpose |
|------|---------|
| `artifacts/login-app/src/hooks/channels/use-channel-workflow-binding.ts` | `useActiveAutomationFlows`, `useChannelWorkflowBinding`, `useChannelWorkflowBindingForm` |
| `artifacts/login-app/src/lib/channel-workflow-binding/channel-workflow-binding-repository.ts` | Fetch/save bindings, resolve create/update/disable/remove |
| `artifacts/login-app/src/lib/channel-workflow-binding/types.ts` | Binding types |

### Database

| Migration | Table |
|-----------|-------|
| `supabase/migrations/138_company_channel_automation_bindings.sql` | `company_channel_automation_bindings` |

---

## Requirements Checklist

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Update WhatsApp configure dialog in `/dashboard/channels` | ✅ |
| 2 | Add "Automation Workflow" section | ✅ |
| 3 | Load active `automation_flows` for current company | ✅ `.eq("status","active")` |
| 4 | Enable toggle + workflow dropdown + AI Runtime helper | ✅ |
| 5 | Save upserts/disables/removes binding | ✅ |
| 6 | Reopen dialog loads current binding | ✅ `useEffect` on binding query |
| 7 | Do not modify AI Runtime configuration | ✅ Helper text only |
| 8 | Success/error messages | ✅ Toast messages per action |
| 9 | Component tests | ✅ 11 checks |

---

## Save Behavior

| User action | Result |
|-------------|--------|
| Enable + select workflow (no existing binding) | **Insert** binding (`is_enabled=true`) |
| Change workflow on existing binding | **Update** `automation_flow_id` |
| Disable toggle (flow still selected) | **Update** `is_enabled=false` |
| Clear workflow ("No workflow") | **Soft-delete** (`deleted_at`, `is_enabled=false`) |
| Save with toggle on but no workflow | **Validation error** toast |

---

## UI Screenshots

| Asset | Path |
|-------|------|
| Configure dialog mock | `docs/operations/sprint-w2-screenshots/configure-dialog-mock.png` |
| Component HTML preview | `docs/operations/sprint-w2-screenshots/automation-workflow-section-preview.html` |

Open the HTML preview in a browser for a live-rendered `ChannelWorkflowBindingSection`.

---

## Test Results

```bash
cd artifacts/login-app
npm run test:channel-workflow-binding
```

```
Channel workflow binding tests

  ✓ resolve create binding
  ✓ resolve update binding
  ✓ resolve disable binding
  ✓ resolve invalid when enabled without flow
  ✓ create binding
  ✓ load existing binding
  ✓ update binding
  ✓ disable binding
  ✓ resolve remove binding when workflow cleared
  ✓ remove binding when workflow cleared
  ✓ component renders automation workflow section

All channel workflow binding checks passed.
```

---

## i18n

English and Arabic keys under `dashboard.channels.automationWorkflow.*` in:
- `artifacts/login-app/src/locales/en/common.json`
- `artifacts/login-app/src/locales/ar/common.json`

---

## Manual QA

1. Sign in as a user with `channels.manage` permission
2. Go to **Dashboard → Channels**
3. Click **Configure** on a WhatsApp channel
4. Toggle **Enable workflow**, select an active workflow, **Save configuration**
5. Reopen dialog — binding should be restored
6. Disable toggle or select **No workflow** — binding disabled/removed on save
