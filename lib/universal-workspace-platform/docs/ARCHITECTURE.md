# Universal Workspace Platform (OP4)

Extends OP1–OP3 without modifying their core contracts. Every business object
(Customer, Lead, Employee, Invoice, Order, Ticket, Project, Asset, Company, Contract)
opens through one metadata-driven workspace engine.

## Package

`@workspace/universal-workspace-platform` — depends on `@workspace/universal-operations-engine`.

## Engines

| Engine | Responsibility |
|--------|----------------|
| `workspaceEngine` | Resolve workspace definition by entity type + template |
| `personalizationEngine` | Per-user layout, density, theme, saved filters (mock store) |
| `widgetEngine` | Metadata-driven dashboard widgets |
| `commandEngine` | Role-aware command registry |
| `searchEngine` | Global search index with grouped results |
| `notificationEngine` | Live notification center (mock) |
| `favoritesEngine` | Pinned items |
| `activityEngine` | Company-wide activity stream |
| `designerEngine` | Admin workspace builder (drag-and-drop mock) |
| `templateRegistry` | 13 industry templates |
| `workspacePlatformOrchestrator` | Composes platform snapshot |

## UI (login-app)

- `WorkspacePlatformShell` — wraps Operations layout
- `WorkspaceCommandCenter` — Ctrl+K (scoped to workspace routes)
- `WorkspaceGlobalSearch` — `/` shortcut
- `WorkspaceNotificationCenter`, `WorkspaceFavoritesBar`, `WorkspaceWidgetsGrid`
- `WorkspaceActivityStream`, `WorkspaceDesigner`, `WorkspaceAiAssistant`

## Routes

- `/operations/hub` — Command Hub
- `/operations/designer` — Workspace Designer (requires configure permission)

## Constraints

- Mock data only — no backend integration
- OP1 queue/grid, OP2 Customer360, OP3 intelligence unchanged
- Metadata-driven blocks, widgets, commands, templates
