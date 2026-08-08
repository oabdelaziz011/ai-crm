# Operations Module — Complete Product & Technical Audit

**Date:** August 5, 2026  
**Scope:** Universal Operations area under `/dashboard/operations` (login-app), supporting libraries, and backend integrations.  
**Method:** Static codebase review only — no code changes, no runtime testing.  
**Assumption:** Audit reflects repository state at time of review.

---

## 1. Executive summary

The Operations module is a **multi-route workspace** with one **production-grade data path** (configuration persistence + live queue from bookings) and several **presentation-only or mock surfaces** (calendar, kanban, timeline, analytics, parts of hub/platform chrome).

| Area | Maturity |
|------|----------|
| **Configuration (save/publish/rollback)** | Backend wired to Supabase `platform_configurations` — **production-ready core** |
| **Queue list + row drill-in** | Live bookings + published config — **production-ready read path**; many toolbar actions disconnected |
| **Customer360 side panel** | Partial live data; several actions wired, many UI buttons disabled |
| **Calendar / Kanban / Timeline / Analytics** | **Placeholder / mock** — no operational UI |
| **Hub / Designer / Platform shell** | Mixed — config-driven widgets; notifications/activity/search largely mock |

**Primary risk for administrators:** The configuration experience was redesigned toward task-oriented CRUD tables, but **secondary settings still use card-based editors**, and **queue/calendar views do not yet consume all configured metadata at runtime** (permissions, saved views, automations, routing).

---

## 2. Classification legend

Every capability below is tagged with one of:

| Tag | Meaning |
|-----|---------|
| **PR** | Already implemented and production-ready |
| **UR** | Implemented but UI needs redesign (works, confusing, or inconsistent IA) |
| **BM** | Backend exists but UI missing (or minimal stub) |
| **UM** | UI exists but backend missing or non-functional |
| **CM** | Completely missing |

---

## 3. Route inventory

Base path: `/dashboard/operations` → `UniversalOperationsLayout` (`WorkspacePlatformShell` + sub-nav).

| Route | Page component | Route permission | Classification |
|-------|----------------|------------------|----------------|
| `/operations` (index) | Redirect → `/operations/queue` | — | PR |
| `/operations/hub` | `WorkspaceHubPage` | None | UR (widgets from config; activity/notifications mock) |
| `/operations/queue` | `OperationsQueuePage` | None | PR read / UR actions |
| `/operations/calendar` | `OperationsCalendarPage` | None | UM (config summary only) |
| `/operations/kanban` | `OperationsKanbanPage` | None | UM (config summary only) |
| `/operations/timeline` | `OperationsTimelinePage` | None | UM (config summary only) |
| `/operations/configuration` | `OperationsConfigurationPage` | `operations.universal.configure` | PR backend / UR IA (task hub + tables) |
| `/operations/analytics` | `OperationsAnalyticsPage` | None | CM (hardcoded mock KPIs) |
| `/operations/designer` | `WorkspaceDesignerPage` | `operations.universal.configure` | UR (saves draft; drag-drop mock engine) |

**Sub-nav:** `UniversalOperationsSubNav` — filters routes by permission; shows permission message via `UniversalOperationsRouteGuard` when blocked.

---

## 4. Permissions & RBAC

### 4.1 Route-level

| Permission | Routes / behavior |
|------------|-------------------|
| `operations.universal.configure` | Configuration, Designer |
| *(none)* | Hub, Queue, Calendar, Kanban, Timeline, Analytics |

### 4.2 Data & command permissions (application layer)

| Permission | Used for |
|------------|----------|
| `operations.read` | Read published workspace config (`operationsWorkspaceRead`) |
| `operations.write` | Check-in, check-out, assign employee, mark no-show (`application-services`) |
| `bookings.view` | Booking queue/calendar/list reads |
| `configuration.read` / `configuration.operations.read` | Config read (aliased in editor hook) |
| `configuration.write` / `configuration.operations.write` | Config draft save |
| `configuration.publish` | Config publish |
| `operations.universal.configure` | Config read/write/publish (legacy alias) |
| `operations.configuration.manage` | Config read/write/publish (legacy alias) |

**Gap:** Queue and Customer360 actions require `operations.write`, but the UI does not surface permission-denied states per action — mutations fail at API layer only (**UR**).

---

## 5. Backend integrations (working)

### 5.1 Supabase tables (direct)

| Table | Integration | Status |
|-------|-------------|--------|
| `platform_configurations` | Draft save, publish, scope = template key, domain = `operations.workspace` | **PR** |
| `platform_configuration_versions` | Version history, rollback, compare | **PR** |
| `scheduling_bookings` | Queue rows via `OperationsRepository.listBookingsForDay` | **PR** (today only) |
| `customers`, invoices (billing repo) | Payment status on queue rows | **PR** |
| Realtime subscriptions | `useUniversalOperationsRealtime` invalidates queue/config queries | **PR** |

### 5.2 Application-layer ports (login-app adapters)

| Port | Adapter | Purpose |
|------|---------|---------|
| `ConfigurationReadPort` | `configuration-read-port-adapter.ts` | get, getPublished, listVersions |
| `ConfigurationWritePort` | `configuration-write-port-adapter.ts` | saveDraft, publish, rollback |
| `operationsWorkspaceRead` | `operations-workspace-read-port-adapter.ts` | Published config for queue/runtime |
| `bookingRead` | `booking-read-port-adapter.ts` | listQueue, listCalendar, listForCustomer |
| `operations` (commands) | Application services | checkIn, checkOut, assign, noShow |
| `booking` (commands) | Application services | cancel, reschedule |
| `payment` (commands) | Application services | collectPayment |

### 5.3 Client services

| Service | File | Status |
|---------|------|--------|
| Config CRUD orchestration | `operations-workspace-config-service.ts` | **PR** |
| Queue row mapping | `operations-queue-row-mapper.ts` | **PR** (maps booking → config column values) |
| Customer360 aggregate | `customer360-workspace-mapper.ts` + hooks | **PR** (live ports) |
| Config validation/diff/merge | `@workspace/universal-operations-engine` | **PR** (client-side engine) |

### 5.4 Not wired to runtime (config stored only)

| Config section | Stored in DB | Consumed at runtime |
|----------------|--------------|---------------------|
| `automation.*` | Yes | **No** execution bridge from operations UI |
| `integrations.featureFlags` / `routing` | Yes | **No** runtime router in universal ops |
| `permissions.*` | Yes | **Limited** — not enforced on queue grid columns/actions |
| `notifications.*` | Yes | **No** outbound send from this module |
| `ai.*` | Yes | Partial — intelligence UI reads flags; no full copilot backend |
| `sla.*` | Yes | **No** alerting runtime |
| `forms.*` | Yes | **No** dynamic form renderer in queue |

---

## 6. Operations Queue (`/operations/queue`)

### 6.1 Features

| Feature | Classification | Notes |
|---------|----------------|-------|
| Template selector | PR | Platform context or local fallback (clinic / training_center / automotive) |
| KPI cards (total, waiting, paid, completed) | UR | Hardcoded status/payment IDs (`st_checked_in`, `pay_paid`, `st_completed`) — breaks if config renames IDs |
| Live data grid | PR | Bookings for **today** + search + sort + virtualized scroll |
| Row click → Customer360 sheet | PR | Opens `OperationsWorkspacePanel` |
| Grid preferences persistence | PR | Saves `views.gridPreferences` to config **draft** via `saveOperationsConfigurationDraft` (does not auto-publish) |
| Realtime refresh | PR | Subscribes to booking/config table changes |

### 6.2 Queue toolbar actions (`OperationsDataGrid`)

| Action | UI state | Handler | Classification |
|--------|----------|---------|----------------|
| Search | Enabled | `updateSearch` → live filter | **PR** |
| AI Search | **Disabled** | None | **CM** |
| Saved Views dropdown | Enabled | Static menu items (Today / Waiting / Unpaid) — **no apply logic** | **UM** |
| Bulk Actions | Disabled unless rows selected | **No mutation handler** | **UM** |
| Export | Enabled | **No `onClick`** | **UM** |
| Import | Enabled | **No `onClick`** | **UM** |

### 6.3 Column header menu (per-column ⋯)

| Menu item | Behavior | Classification |
|-----------|----------|----------------|
| Sort | Header click sorts; menu item **disabled** when column not sortable | UR |
| Filter | **Disabled** when not filterable; no filter UI when enabled | **UM** |
| Pin | **No handler** | **UM** |
| Hide | **No handler** | **UM** |

### 6.4 Table row actions

| Action | Behavior | Classification |
|--------|----------|----------------|
| Row select (checkbox) | Updates selection state only | PR (selection) / UM (no bulk use) |
| Row click | Opens Customer360 | PR |

---

## 7. Customer360 / Operations side panel

### 7.1 Components

| Component | Role |
|-----------|------|
| `OperationsWorkspacePanel` | Thin wrapper → `Customer360Workspace` |
| `Customer360Workspace` | Sheet layout, header, sections, intelligence layer |
| `Customer360Sections` | Section renderers (today's op, CRM, timeline, etc.) |
| `Customer360IntelligenceLayer` | Recommendations, alerts, copilot UI |
| `useCustomer360Workspace` | Loads live aggregate via application ports |
| `useOperationsCommands` | Mutations: checkIn, checkOut, cancel, reschedule, assign, noShow, collectPayment |

### 7.2 Today's operation actions (in sections)

| Action | Wired to backend | UI state | Classification |
|--------|------------------|----------|----------------|
| Check in | Yes (`operations.checkInCustomer`) | Enabled when `operationsReady` | **PR** |
| Check out | Yes | Enabled | **PR** |
| Cancel | Yes (`booking.cancelBooking`) | Enabled | **PR** |
| Collect payment | Yes (`payment.collectPayment`) | Enabled | **PR** |
| No show | Hook exists (`markNoShow`) | **Button disabled** in UI | **BM** |
| Reschedule | Hook exists (`rescheduleBooking`) | **Button disabled** in UI | **BM** |

### 7.3 Quick actions bar (`Customer360QuickActions`)

All primary and overflow actions (call, WhatsApp, email, SMS, invoice, book, print, CRM, assign, note, upload, AI) are **`disabled` with no handlers** — **UM**.

### 7.4 Legacy panel tabs

`panel-overview-tab.tsx` still contains disabled check-in button — appears **superseded** by Customer360 path (**orphaned / UR**).

---

## 8. Placeholder views (Calendar, Kanban, Timeline)

All three use `ConfigDrivenView` in `operations-placeholder-pages.tsx`:

- Read **published** config via `useUniversalOperationsConfig`
- Display **read-only summary cards** (default view, slot minutes, group-by, etc.)
- **Do not** render bookings, drag-drop, or interactive boards

| View | Classification |
|------|----------------|
| Calendar | **UM** — UI stub, `bookingRead.listCalendar` exists but unused here |
| Kanban | **UM** — shows kanban column definitions from config only |
| Timeline | **UM** — shows timeline settings only |

---

## 9. Analytics (`/operations/analytics`)

| Element | Classification |
|---------|----------------|
| All KPI values (47, $4,280, 8, 23, 3, 87%, 32 min) | **CM** — hardcoded |
| `mockNote` i18n string | Explicit placeholder |

**Backend note:** Separate `lib/scheduling/operations/analytics` exists for scheduling module — **not connected** to this page (**BM**).

---

## 10. Hub & Workspace Platform shell

### 10.1 Hub page

| Feature | Source | Classification |
|---------|--------|----------------|
| Dashboard widgets grid | `config.dashboard.widgets` via platform snapshot | **PR** (display) |
| Activity stream | `activityEngine` → **MOCK_ACTIVITY_EVENTS** | **UM** |
| AI assistant block | `WorkspaceAiAssistant` | **UR** (platform chrome) |

### 10.2 Platform context (`workspace-platform-context.tsx`)

| Feature | Data source | Classification |
|---------|-------------|----------------|
| Snapshot/widgets | Live config + widget engine | **PR** |
| Search | Mock search index | **UM** |
| Notifications | Mock notifications engine | **UM** |
| Favorites | Mock favorites | **UM** |
| Personalization | Mock in-memory store | **UM** |
| Command palette | Mock commands | **UM** |

### 10.3 Designer (`/operations/designer`)

| Feature | Classification |
|---------|----------------|
| Palette / canvas | Mock designer engine | **UR** |
| Save layout to `config.designer` | **PR** (draft save via `saveOperationsConfigurationDraft`) |
| Publish after save | **Not automatic** — admin must publish on Configuration page | **UR** |

---

## 11. Configuration page (`/operations/configuration`)

### 11.1 Information architecture (current)

1. **Header** — title + subtitle  
2. **Status bar** — template, draft/live badges, Save draft / Validate / Publish, publish note  
3. **Validation panel** — engine report  
4. **Task hub (home)** — 5 primary tasks + 8 secondary tasks  
5. **Task screens** — table CRUD (primary) or legacy card editors (secondary)  
6. **Advanced tools** (collapsible) — enterprise toolbar  
7. **Dialogs** — diff, rollback confirm, clone, preview  

**Orphaned components (still in repo, not mounted on main page):**

- `operations-config-nav.tsx` (grouped tab nav)
- `operations-config-tab-intro.tsx`
- `operations-config-workflow-guide.tsx`
- `operations-config-tab-content.tsx` (legacy tab router)

### 11.2 Primary task screens (table CRUD)

| Task | Screen | Draft mutation | Classification |
|------|--------|----------------|----------------|
| Manage queue columns | `ColumnsManagementScreen` | `draft.columns` | **PR** / **UR** (table IA improved) |
| Manage visit statuses | `StatusesManagementScreen` | `draft.statuses`, `statusTransitions` | **PR** / **UR** |
| Manage services | `ServicesManagementScreen` | `draft.services` | **PR** / **UR** |
| Manage resources | `ResourcesManagementScreen` | `draft.resources` | **PR** / **UR** |
| Manage permissions | `PermissionsManagementScreen` | `draft.permissions` | **PR** / **UR** (runtime enforcement missing) |

### 11.3 Secondary task screens

| Task | UI | Classification |
|------|-----|----------------|
| Payment statuses | Table CRUD (`PaymentStatusesManagementScreen`) | **PR** / **UR** |
| Names & labels | Legacy `GeneralConfigTab` (form fields) | **PR** / **UR** |
| Saved views | Legacy `ViewsConfigTab` (cards) | **PR** / **UR** |
| Alerts | `NotificationsConfigTab` | **PR** storage / **UM** delivery |
| Connections | `IntegrationsConfigTab` | **PR** storage / **UM** runtime |
| Automations | `AutomationConfigTab` + Workflow Builder link | **PR** storage / **UM** runtime |
| AI assistant | `AiConfigTab` | **PR** storage / partial runtime |
| History & screens | `AdvancedConfigTab` (version history, SLA, queue rules, layouts) | **PR** / **UR** |

### 11.4 Configuration workflow actions (status bar)

| Action | Backend | Classification |
|--------|---------|----------------|
| Template selector | Switches `templateKey` (platform context) | **PR** |
| Save draft | `saveOperationsConfigurationDraft` → `platform_configurations.draft_config` | **PR** |
| Validate | Client `validateOperationsWorkspaceConfig` | **PR** |
| Publish | Save + `publish` → `published_config`, version++ | **PR** |
| Publish note | Stored in version `change_summary` | **PR** |

### 11.5 Enterprise toolbar (Advanced tools)

| Action | Behavior | Classification |
|--------|----------|----------------|
| Undo / Redo | In-memory history stack (50 states) | **PR** (session-only, not persisted until save) |
| Export JSON | Downloads draft JSON | **PR** |
| Import JSON | Merge/replace into draft | **PR** |
| Clone to template | Save + publish to target template | **PR** |
| Preview raw JSON | Dialog | **PR** |
| Compare with live | Diff dialog (paths only, no before/after values) | **UR** |
| Discard draft | Re-saves **published** config as draft (does not NULL `draft_config`) | **UR** |
| Reset section | Resets one config key to defaults | **PR** |
| Reset to published | Reloads published into editor | **PR** |

### 11.6 Dialogs

| Dialog | Trigger | Classification |
|--------|---------|----------------|
| Diff | Toolbar or version Compare | **UR** — shows paths, not human-readable field deltas |
| Rollback confirm | Advanced → Restore version | **PR** |
| Clone | Toolbar | **PR** |
| Preview | Toolbar | **PR** |

### 11.7 Configuration feature matrix (all `OperationsWorkspaceConfig` domains)

| Domain | Editor location | Persisted | Runtime use | Classification |
|--------|-----------------|-----------|-------------|----------------|
| `workspaceName`, terminology, branding | General | Yes | Queue title, labels | **PR** |
| `columns` | Columns task | Yes | Queue grid columns | **PR** |
| `statuses`, `statusTransitions` | Statuses task | Yes | Row status display; transitions **not enforced** in UI actions | **PR** / **BM** (transition engine in UI) |
| `paymentStatuses` | Payment statuses | Yes | Queue payment pills | **PR** |
| `services` | Services task | Yes | Row service name mapping | **PR** |
| `resources` | Resources task | Yes | Limited in queue mapper | **UR** |
| `permissions` | Permissions task | Yes | **Not enforced** on grid | **UM** |
| `views.savedViews` | Views (secondary) | Yes | Saved views dropdown **not wired** | **BM** |
| `views.gridPreferences` | Views + queue implicit save | Yes | Queue column order/visibility | **PR** |
| `notifications` | Notifications | Yes | No sender | **UM** |
| `featureFlags`, `routing` | Integrations | Yes | No router | **UM** |
| `automation` | Automation | Yes | No trigger runner | **UM** |
| `ai` | AI task | Yes | Partial intelligence UI | **UR** |
| `dashboard` | Advanced | Yes | Hub widgets | **PR** |
| `sla`, `queueRules` | Advanced | Yes | Partial (`pageSize`, default sort) | **UR** |
| `forms` | Advanced | Yes | No renderer | **BM** |
| `customer360`, `intelligence` layouts | Advanced layout tabs | Yes | Customer360 section visibility | **PR** |
| `kanban`, `calendar`, `timeline` layouts | Advanced layout tabs | Yes | Placeholder pages only | **BM** |
| `designer` | Designer page | Yes | Designer canvas only | **UR** |

---

## 12. Table actions inventory (Configuration CRUD)

### 12.1 Columns table

| Action | Works | Classification |
|--------|-------|----------------|
| Add column | Yes | **PR** |
| Edit display name, internal name, type, visible, width | Yes | **PR** |
| Reorder (up/down) | Yes | **PR** |
| Delete | Yes | **PR** |
| Pin column | **Not in table** (was in legacy card UI) | **BM** in new table |
| Required / searchable / exportable flags | **Not in table** | **BM** in new table |

### 12.2 Statuses table

| Action | Works | Classification |
|--------|-------|----------------|
| Add / edit / delete status | Yes | **PR** |
| Terminal toggle | Yes | **PR** |
| Color, icon | Color yes; icon field removed from table | **UR** |
| Transitions sub-table | Add / edit / delete | **PR** |

### 12.3 Services / Resources / Payment statuses tables

| Action | Works | Classification |
|--------|-------|----------------|
| Full row CRUD | Yes | **PR** |

### 12.4 Permissions table

| Action | Works | Classification |
|--------|-------|----------------|
| Add rule | Defaults to first column | **UR** |
| Change item (column/status dropdown; action free-text) | Yes | **PR** |
| Edit roles (comma-separated) | Yes | **PR** |
| Delete rule | Yes | **PR** |
| Choose permission **type** on add | **Not available** | **UR** |

---

## 13. Reusable components catalog

### 13.1 Pages

| Component | Path | Reusable |
|-----------|------|----------|
| `UniversalOperationsLayout` | `layout/universal-operations-layout.tsx` | Shell for all ops routes |
| `OperationsQueuePage` | `pages/.../operations-queue-page.tsx` | Yes |
| `OperationsConfigurationPage` | `pages/.../operations-configuration-page.tsx` | Yes |
| `OperationsCalendar/Kanban/TimelinePage` | `operations-placeholder-pages.tsx` | Stub pattern only |
| `OperationsAnalyticsPage` | Mock KPIs | Replace before reuse |
| `WorkspaceHubPage` / `WorkspaceDesignerPage` | Platform pages | Yes |

### 13.2 Configuration module

| Component | Status |
|-----------|--------|
| `OperationsConfigTaskHub` | Active — task landing |
| `OperationsConfigScreenShell` | Active — back + title + add |
| `OperationsConfigScreenContent` | Active — screen router |
| `OperationsConfigManagementScreens` | Active — primary CRUD tables |
| `OperationsConfigStatusBar` | Active |
| `OperationsConfigValidationReportPanel` | Active |
| `OperationsConfigEnterpriseToolbar` | Active |
| `OperationsConfigDiffDialog` | Active |
| `operations-config-entity-tabs.tsx` | Legacy — used indirectly via secondary screens / duplicate logic |
| `operations-config-platform-tabs.tsx` | Active — secondary settings |
| `operations-config-layout-tabs.tsx` | Active — layout editors in Advanced |
| `operations-config-nav.tsx` | **Orphaned** |
| `operations-config-tab-intro.tsx` | **Orphaned** |
| `operations-config-workflow-guide.tsx` | **Orphaned** |
| `operations-config-tab-content.tsx` | **Orphaned** |
| `operations-config-tab-groups.ts` | **Orphaned** (only used by orphaned nav) |

### 13.3 Queue & Customer360

| Component | Reusable |
|-----------|----------|
| `OperationsDataGrid` | Yes — core queue table |
| `OperationsWorkspacePanel` | Yes |
| `Customer360Workspace` + sections/intelligence | Yes |
| `WorkspacePanel`, `WorkspaceMetric` | Shared workspace UI |

### 13.4 Hooks

| Hook | Purpose |
|------|---------|
| `useUniversalOperationsQueue` | Queue data + preferences |
| `useUniversalOperationsConfig` | Published config query |
| `useOperationsConfigurationEditor` | Full config editor state |
| `useUniversalOperationsRealtime` | Query invalidation |
| `useOperationsCommands` | Booking/ops mutations |
| `useCustomer360Workspace` | Side panel aggregate |
| `useCustomer360Intelligence` | Intelligence snapshot |
| `useConfigurationCommands` | Exists — verify consumers |
| `useOperationsCommands` | Primary mutation hook |

### 13.5 Libraries (monorepo)

| Package | Role |
|---------|------|
| `@workspace/universal-operations-engine` | Config schema, validation, queue engine, metadata |
| `@workspace/universal-workspace-platform` | Hub widgets, mock platform engines |
| `@workspace/application-layer` | Ports, DTOs, command services |
| `@workspace/configuration-platform` | Domain normalization |
| `lib/scheduling/operations/*` | **Separate** scheduling ops stack (repository, timeline UI components) — used by booking adapter, not universal ops routes |

---

## 14. Disconnected buttons & controls (summary)

| Location | Control | Issue |
|----------|---------|-------|
| Queue grid | AI Search | Permanently disabled |
| Queue grid | Saved Views items | No state change |
| Queue grid | Bulk Actions | No handler |
| Queue grid | Export / Import | No handler |
| Queue grid | Column ⋯ → Pin / Hide | No handler |
| Queue grid | Column ⋯ → Filter | Disabled / no UI |
| Customer360 | All quick actions | All disabled |
| Customer360 | No show / Reschedule | Disabled despite hooks |
| Panel overview tab | Check in | Disabled (legacy) |
| Analytics | Entire page | Static numbers |
| Calendar/Kanban/Timeline | Entire views | Non-interactive summaries |

---

## 15. Missing features (completely or largely absent)

| Feature | Classification |
|---------|----------------|
| Interactive calendar board | **CM** |
| Interactive kanban board | **CM** |
| Interactive timeline/Gantt | **CM** |
| Live analytics dashboard | **CM** |
| AI-powered queue search | **CM** |
| Queue export/import | **CM** |
| Bulk row operations | **CM** |
| Saved views applied from config | **CM** (UI stub only) |
| Configured automations executed on booking events | **CM** in this module |
| Notification delivery from config templates | **CM** |
| Integration routing rules applied at runtime | **CM** |
| Column-level RBAC enforcement on queue | **CM** |
| Status transition enforcement on check-in/out | **CM** |
| Multi-day / date-range queue (only today) | **CM** |
| True discard draft (clear DB draft column) | **CM** |
| Customer communication actions (call/email/SMS) from Customer360 | **CM** |

---

## 16. APIs & data flow diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     /dashboard/operations                        │
├─────────────┬──────────────┬───────────────┬────────────────────┤
│    Queue    │ Configuration│  Customer360  │  Hub / Designer    │
└──────┬──────┴──────┬───────┴───────┬───────┴─────────┬──────────┘
       │             │               │                 │
       v             v               v                 v
 bookingRead    configuration.*   customer/booking   config (read)
 operations.*   platform_config    payment ports     mock platform
       │             │               │                 │
       v             v               v                 v
 scheduling_    platform_         Supabase CRM/       in-memory /
 bookings       configurations    billing tables      mock engines
```

---

## 17. Recommendations priority (audit only — not implemented)

1. **Wire queue toolbar** to existing config (`savedViews`, export service) or disable until ready.  
2. **Replace placeholder routes** (calendar/kanban/timeline) with real views or rename nav to “Preview settings”.  
3. **Enable or hide** Customer360 quick actions and no-show/reschedule.  
4. **Enforce or document** config permissions at queue runtime.  
5. **Remove or repurpose orphaned** configuration components to reduce IA confusion.  
6. **Fix KPI** to derive status IDs from published config, not hardcoded strings.  
7. **Analytics** — connect to scheduling analytics selectors or mark route hidden.

---

## 18. Master classification summary

| Classification | Count (approx.) | Examples |
|----------------|-----------------|----------|
| **PR** | ~45 | Config save/publish, queue live data, column CRUD tables, check-in/out/cancel/collect |
| **UR** | ~25 | Task hub IA, KPI hardcoding, diff dialog, discard draft semantics, designer publish flow |
| **BM** | ~15 | listCalendar port unused, saved views engine, no-show/reschedule hooks, scheduling analytics |
| **UM** | ~20 | Calendar/kanban/timeline pages, analytics page, grid export/import, mock platform feeds |
| **CM** | ~15 | AI search, bulk ops, automation runtime, notification send, transition enforcement |

---

*End of audit — no code was modified during this review.*
