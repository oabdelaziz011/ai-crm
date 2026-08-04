# Idempotency Audit: `229_production_recovery.sql`

**File:** `supabase/migrations/229_production_recovery.sql`  
**Lines:** 3830  
**Audit date:** 2026-08-04  
**Migration modified:** No  

---

## Executive summary

| Result | Count |
|--------|------:|
| Statements audited (requested categories) | **260** |
| **SAFE** | **260** |
| **NOT SAFE** | **0** |

**Verdict: All statements in the requested categories are fully idempotent.** The file is safe to execute multiple times for CREATE TABLE, CREATE INDEX, CREATE POLICY, CREATE TRIGGER, ALTER TABLE ADD COLUMN, ALTER PUBLICATION, CREATE FUNCTION, GRANT, and COMMENT.

### Category rollup

| Category | Count | SAFE | NOT SAFE |
|----------|------:|-----:|---------:|
| CREATE TABLE | 48 | 48 | 0 |
| CREATE INDEX | 73 | 73 | 0 |
| CREATE SEQUENCE | 1 | 1 | 0 |
| CREATE TYPE | 0 | 0 | 0 |
| CREATE POLICY | 86 | 86 | 0 |
| CREATE TRIGGER | 9 | 9 | 0 |
| ALTER TABLE ADD COLUMN | 8 | 8 | 0 |
| ALTER TABLE ADD CONSTRAINT | 0 | 0 | 0 |
| ALTER PUBLICATION | 22 | 22 | 0 |
| CREATE FUNCTION | 8 | 8 | 0 |
| GRANT | 2 | 2 | 0 |
| COMMENT | 3 | 3 | 0 |
| ENABLE ROW LEVEL SECURITY (informational) | 45 | 45 | 0 |

**CREATE TYPE:** none present in file.  
**ALTER TABLE ADD CONSTRAINT:** none present as standalone statements (constraints are inline in `CREATE TABLE IF NOT EXISTS`).

---

## Idempotency caveats (not failures on re-run)

These do **not** change the SAFE/NOT SAFE verdict but affect **schema drift recovery**:

1. **`CREATE TABLE IF NOT EXISTS`** — If a table already exists with an older/partial definition, re-running does **not** add missing columns, indexes, or constraints. No error is raised.
2. **Inline constraints in CREATE TABLE** — Same as above; only evaluated at initial create.
3. **`ON CONFLICT DO UPDATE` seed INSERTs** (permissions, tool_definitions) — Idempotent for re-run (27 INSERT blocks, all use `ON CONFLICT` and/or `WHERE NOT EXISTS`; out of requested audit scope).
4. **Missing GRANT on `handoff_platform_company_metrics_v1` / `lead_platform_company_metrics_v1`** — Omission vs source migrations 217/218 (those files also omit grants); not an idempotency failure.

---

---

## Full statement register

### CREATE TABLE

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 76 | **SAFE** | IF NOT EXISTS | `create table if not exists public.support_tickets (` |
| 116 | **SAFE** | IF NOT EXISTS | `create table if not exists public.support_ticket_comments (` |
| 644 | **SAFE** | IF NOT EXISTS | `create table if not exists public.handoff_queues (` |
| 675 | **SAFE** | IF NOT EXISTS | `create table if not exists public.handoff_queue_members (` |
| 695 | **SAFE** | IF NOT EXISTS | `create table if not exists public.handoff_conversation_ownership (` |
| 728 | **SAFE** | IF NOT EXISTS | `create table if not exists public.handoff_ownership_history (` |
| 747 | **SAFE** | IF NOT EXISTS | `create table if not exists public.handoff_requests (` |
| 783 | **SAFE** | IF NOT EXISTS | `create table if not exists public.handoff_context_snapshots (` |
| 798 | **SAFE** | IF NOT EXISTS | `create table if not exists public.agent_presence (` |
| 817 | **SAFE** | IF NOT EXISTS | `create table if not exists public.handoff_escalation_rules (` |
| 1108 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_pipelines (` |
| 1129 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_stages (` |
| 1156 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_sources (` |
| 1176 | **SAFE** | IF NOT EXISTS | `create table if not exists public.leads (` |
| 1232 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_assignments (` |
| 1253 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_scores (` |
| 1268 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_tags (` |
| 1283 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_notes (` |
| 1300 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_activities (` |
| 1315 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_history (` |
| 1331 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_conversion_history (` |
| 1346 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_custom_fields (` |
| 1365 | **SAFE** | IF NOT EXISTS | `create table if not exists public.lead_import_batches (` |
| 1680 | **SAFE** | IF NOT EXISTS | `create table if not exists public.entity_type_registry (` |
| 1702 | **SAFE** | IF NOT EXISTS | `create table if not exists public.entity_contacts (` |
| 1739 | **SAFE** | IF NOT EXISTS | `create table if not exists public.entity_files (` |
| 1771 | **SAFE** | IF NOT EXISTS | `create table if not exists public.entity_tags (` |
| 1795 | **SAFE** | IF NOT EXISTS | `create table if not exists public.entity_tag_assignments (` |
| 1815 | **SAFE** | IF NOT EXISTS | `create table if not exists public.entity_custom_fields (` |
| 1845 | **SAFE** | IF NOT EXISTS | `create table if not exists public.entity_custom_field_values (` |
| 1867 | **SAFE** | IF NOT EXISTS | `create table if not exists public.entity_activities (` |
| 2548 | **SAFE** | IF NOT EXISTS | `create table if not exists public.tasks (` |
| 2589 | **SAFE** | IF NOT EXISTS | `create table if not exists public.operations_workspace_config (` |
| 2814 | **SAFE** | IF NOT EXISTS | `create table if not exists public.configuration_domain_registry (` |
| 2844 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_configurations (` |
| 2867 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_configuration_versions (` |
| 3081 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_feature_flag_registry (` |
| 3117 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_feature_flags (` |
| 3144 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_feature_flag_versions (` |
| 3161 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_plan_entitlements (` |
| 3182 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_company_licenses (` |
| 3373 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_event_audit (` |
| 3400 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_event_timeline (` |
| 3423 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_event_dlq (` |
| 3445 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_event_subscriber_telemetry (` |
| 3463 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_event_correlations (` |
| 3481 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_event_idempotency (` |
| 3498 | **SAFE** | IF NOT EXISTS | `create table if not exists public.platform_reactive_signals (` |

### CREATE INDEX

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 100 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_support_tickets_company_status` |
| 104 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_support_tickets_company_priority` |
| 108 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_support_tickets_company_assigned` |
| 112 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_support_tickets_company_customer` |
| 126 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_support_ticket_comments_ticket` |
| 442 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_support_tickets_company_conversation` |
| 446 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_support_tickets_company_customer` |
| 450 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_support_tickets_company_sla_due` |
| 670 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_queues_company_active` |
| 690 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_queue_members_company_user` |
| 716 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_ownership_company_owner` |
| 719 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_ownership_company_queue` |
| 723 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_ownership_company_assigned` |
| 743 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_ownership_history_conversation` |
| 774 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_requests_company_status` |
| 778 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_requests_conversation` |
| 794 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_context_snapshots_conversation` |
| 813 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_agent_presence_company_state` |
| 836 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_handoff_escalation_rules_company_active` |
| 1125 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_pipelines_company_active` |
| 1152 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_stages_pipeline_order` |
| 1172 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_sources_company` |
| 1216 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_leads_company_stage` |
| 1219 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_leads_company_assigned` |
| 1222 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_leads_company_status` |
| 1225 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_leads_company_email` |
| 1228 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_leads_company_phone` |
| 1249 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_assignments_lead_active` |
| 1264 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_scores_lead` |
| 1279 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_tags_company_tag` |
| 1296 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_notes_lead` |
| 1311 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_activities_lead` |
| 1327 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_history_lead` |
| 1342 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_conversion_history_lead` |
| 1381 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_lead_import_batches_company` |
| 1659 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_conversations_company_lead` |
| 1663 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_leads_conversation` |
| 1667 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_leads_customer` |
| 1729 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_contacts_tenant_entity` |
| 1733 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_contacts_search` |
| 1761 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_files_tenant_entity` |
| 1765 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_files_name` |
| 1789 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_tags_tenant` |
| 1809 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_tag_assignments_entity` |
| 1839 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_custom_fields_tenant_type` |
| 1861 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_custom_field_values_entity` |
| 1893 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_activities_entity_occurred` |
| 1897 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_entity_activities_type` |
| 2575 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_tasks_company_entity` |
| 2579 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_tasks_company_assignee` |
| 2583 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_tasks_company_due` |
| 2600 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_operations_workspace_config_company` |
| 2862 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_configurations_tenant_domain` |
| 2880 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_configuration_versions_config` |
| 3136 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_feature_flags_scope` |
| 3139 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_feature_flags_feature` |
| 3156 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_feature_flag_versions_flag` |
| 3174 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_plan_entitlements_code` |
| 3391 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_event_audit_tenant` |
| 3393 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_event_audit_correlation` |
| 3395 | **SAFE** | UNIQUE IF NOT EXISTS | `create unique index if not exists idx_platform_event_audit_event_id` |
| 3416 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_event_timeline_entity` |
| 3418 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_event_timeline_tenant` |
| 3438 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_event_dlq_subscriber` |
| 3440 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_event_dlq_tenant` |
| 3458 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_event_subscriber_telemetry_sub` |
| 3474 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_event_correlations_corr` |
| 3476 | **SAFE** | UNIQUE IF NOT EXISTS | `create unique index if not exists idx_platform_event_correlations_event` |
| 3492 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_event_idempotency_expires` |
| 3510 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_platform_reactive_signals_tenant` |
| 3715 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_scheduling_bookings_company_lead` |
| 3719 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_scheduling_bookings_company_conversation` |
| 3723 | **SAFE** | IF NOT EXISTS | `create index if not exists idx_scheduling_bookings_company_status_start` |

### CREATE SEQUENCE

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 74 | **SAFE** | IF NOT EXISTS | `create sequence if not exists public.support_ticket_number_seq;` |

### CREATE TYPE

_No statements of this type in file._

### CREATE POLICY

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 243 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy support_tickets_select on public.support_tickets for select using ` |
| 256 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy support_tickets_insert on public.support_tickets for insert with c` |
| 268 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy support_tickets_update on public.support_tickets for update using ` |
| 283 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy support_tickets_delete on public.support_tickets for delete using ` |
| 295 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy support_ticket_comments_select on public.support_ticket_comments f` |
| 307 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy support_ticket_comments_insert on public.support_ticket_comments f` |
| 856 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy handoff_queues_tenant on public.handoff_queues for all using (publ` |
| 866 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy handoff_queue_members_tenant on public.handoff_queue_members for a` |
| 876 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy handoff_ownership_tenant on public.handoff_conversation_ownership ` |
| 886 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy handoff_ownership_history_tenant on public.handoff_ownership_histo` |
| 896 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy handoff_requests_tenant on public.handoff_requests for all using (` |
| 906 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy handoff_context_snapshots_tenant on public.handoff_context_snapsho` |
| 916 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy agent_presence_tenant on public.agent_presence for all using (publ` |
| 926 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy handoff_escalation_rules_tenant on public.handoff_escalation_rules` |
| 1405 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_pipelines_tenant on public.lead_pipelines for all using (publ` |
| 1415 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_stages_tenant on public.lead_stages for all using (public.com` |
| 1425 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_sources_tenant on public.lead_sources for all using (public.c` |
| 1435 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy leads_tenant on public.leads for all using (public.company_has_per` |
| 1445 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_assignments_tenant on public.lead_assignments for all using (` |
| 1455 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_scores_tenant on public.lead_scores for all using (public.com` |
| 1465 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_tags_tenant on public.lead_tags for all using (public.company` |
| 1475 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_notes_tenant on public.lead_notes for all using (public.compa` |
| 1485 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_activities_tenant on public.lead_activities for all using (pu` |
| 1495 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_history_tenant on public.lead_history for all using (public.c` |
| 1505 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_conversion_history_tenant on public.lead_conversion_history f` |
| 1515 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_custom_fields_tenant on public.lead_custom_fields for all usi` |
| 1525 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy lead_import_batches_tenant on public.lead_import_batches for all u` |
| 1999 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_contacts_select on public.entity_contacts for select to aut` |
| 2011 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_contacts_insert on public.entity_contacts for insert to aut` |
| 2023 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_contacts_update on public.entity_contacts for update to aut` |
| 2037 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_contacts_delete on public.entity_contacts for delete to aut` |
| 2049 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_files_select on public.entity_files for select to authentic` |
| 2061 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_files_insert on public.entity_files for insert to authentic` |
| 2073 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_files_update on public.entity_files for update to authentic` |
| 2087 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_files_delete on public.entity_files for delete to authentic` |
| 2099 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_tags_select on public.entity_tags for select to authenticat` |
| 2111 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_tags_insert on public.entity_tags for insert to authenticat` |
| 2123 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_tags_update on public.entity_tags for update to authenticat` |
| 2137 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_tags_delete on public.entity_tags for delete to authenticat` |
| 2149 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_tag_assignments_select on public.entity_tag_assignments for` |
| 2161 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_tag_assignments_insert on public.entity_tag_assignments for` |
| 2173 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_tag_assignments_update on public.entity_tag_assignments for` |
| 2187 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_tag_assignments_delete on public.entity_tag_assignments for` |
| 2199 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_custom_fields_select on public.entity_custom_fields for sel` |
| 2211 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_custom_fields_insert on public.entity_custom_fields for ins` |
| 2223 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_custom_fields_update on public.entity_custom_fields for upd` |
| 2237 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_custom_fields_delete on public.entity_custom_fields for del` |
| 2249 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_custom_field_values_select on public.entity_custom_field_va` |
| 2261 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_custom_field_values_insert on public.entity_custom_field_va` |
| 2273 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_custom_field_values_update on public.entity_custom_field_va` |
| 2287 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_custom_field_values_delete on public.entity_custom_field_va` |
| 2299 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_activities_select on public.entity_activities for select to` |
| 2311 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_activities_insert on public.entity_activities for insert to` |
| 2323 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_activities_update on public.entity_activities for update to` |
| 2337 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_activities_delete on public.entity_activities for delete to` |
| 2349 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy entity_tag_assignments_select on public.entity_tag_assignments for` |
| 2613 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy tasks_select on public.tasks for select using (` |
| 2626 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy tasks_insert on public.tasks for insert with check (` |
| 2639 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy tasks_update on public.tasks for update using (` |
| 2652 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy tasks_delete on public.tasks for delete using (` |
| 2669 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy operations_workspace_config_select on public.operations_workspace_` |
| 2682 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy operations_workspace_config_insert on public.operations_workspace_` |
| 2695 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy operations_workspace_config_update on public.operations_workspace_` |
| 2898 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_configurations_select on public.platform_configurations f` |
| 2911 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_configurations_insert on public.platform_configurations f` |
| 2924 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_configurations_update on public.platform_configurations f` |
| 2937 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_configuration_versions_select on public.platform_configur` |
| 2950 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_configuration_versions_insert on public.platform_configur` |
| 3213 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_feature_flags_select on public.platform_feature_flags for` |
| 3223 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_feature_flags_write on public.platform_feature_flags for ` |
| 3238 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_feature_flag_versions_select on public.platform_feature_f` |
| 3252 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_plan_entitlements_select on public.platform_plan_entitlem` |
| 3262 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_company_licenses_select on public.platform_company_licens` |
| 3275 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_company_licenses_write on public.platform_company_license` |
| 3529 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_audit_select on public.platform_event_audit for sel` |
| 3542 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_timeline_select on public.platform_event_timeline f` |
| 3555 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_dlq_select on public.platform_event_dlq for select ` |
| 3568 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_reactive_signals_select on public.platform_reactive_signa` |
| 3582 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_audit_insert on public.platform_event_audit for ins` |
| 3592 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_timeline_insert on public.platform_event_timeline f` |
| 3602 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_dlq_insert on public.platform_event_dlq for insert ` |
| 3612 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_subscriber_telemetry_insert on public.platform_even` |
| 3622 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_correlations_insert on public.platform_event_correl` |
| 3632 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_idempotency_all on public.platform_event_idempotenc` |
| 3642 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_reactive_signals_insert on public.platform_reactive_signa` |
| 3652 | **SAFE** | Guarded by pg_policies existence check in DO block | `create policy platform_event_dlq_update on public.platform_event_dlq for update ` |

### CREATE TRIGGER

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 137 | **SAFE** | Guarded by pg_trigger existence check in DO block | `create trigger support_tickets_updated_at before update on public.support_ticket` |
| 218 | **SAFE** | Guarded by pg_trigger existence check in DO block | `create trigger support_tickets_audit after insert or update or delete on public.` |
| 230 | **SAFE** | Guarded by pg_trigger existence check in DO block | `create trigger support_ticket_comments_audit after insert or update or delete on` |
| 1919 | **SAFE** | Guarded by pg_trigger existence check in DO block | `create trigger trg_entity_contacts_updated_at before update on public.entity_con` |
| 1931 | **SAFE** | Guarded by pg_trigger existence check in DO block | `create trigger trg_entity_files_updated_at before update on public.entity_files ` |
| 1943 | **SAFE** | Guarded by pg_trigger existence check in DO block | `create trigger trg_entity_tags_updated_at before update on public.entity_tags fo` |
| 1955 | **SAFE** | Guarded by pg_trigger existence check in DO block | `create trigger trg_entity_custom_fields_updated_at before update on public.entit` |
| 1967 | **SAFE** | Guarded by pg_trigger existence check in DO block | `create trigger trg_entity_custom_field_values_updated_at before update on public` |
| 1979 | **SAFE** | Guarded by pg_trigger existence check in DO block | `create trigger trg_entity_activities_updated_at before update on public.entity_a` |

### ALTER TABLE ADD COLUMN

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 436 | **SAFE** | ADD COLUMN IF NOT EXISTS (ALTER TABLE at line 435) | `add column if not exists sla_due_at timestamptz,` |
| 437 | **SAFE** | ADD COLUMN IF NOT EXISTS (ALTER TABLE at line 435) | `add column if not exists first_response_at timestamptz,` |
| 438 | **SAFE** | ADD COLUMN IF NOT EXISTS (ALTER TABLE at line 435) | `add column if not exists resolved_at timestamptz,` |
| 439 | **SAFE** | ADD COLUMN IF NOT EXISTS (ALTER TABLE at line 435) | `add column if not exists reopened_at timestamptz,` |
| 440 | **SAFE** | ADD COLUMN IF NOT EXISTS (ALTER TABLE at line 435) | `add column if not exists reopened_by uuid references auth.users(id) on delete se` |
| 1657 | **SAFE** | ADD COLUMN IF NOT EXISTS (ALTER TABLE at line 1656) | `add column if not exists lead_id uuid references public.leads(id) on delete set ` |
| 3712 | **SAFE** | ADD COLUMN IF NOT EXISTS (ALTER TABLE at line 3711) | `add column if not exists lead_id uuid references public.leads(id) on delete set ` |
| 3713 | **SAFE** | ADD COLUMN IF NOT EXISTS (ALTER TABLE at line 3711) | `add column if not exists conversation_id uuid references public.conversations(id` |

### ALTER TABLE ADD CONSTRAINT

_No statements of this type in file._

### ALTER PUBLICATION

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 933 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.handoff_conversation_owners` |
| 940 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.handoff_requests;` |
| 947 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.agent_presence;` |
| 1531 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.leads;` |
| 2438 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.entity_contacts;` |
| 2444 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.entity_files;` |
| 2450 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.entity_tag_assignments;` |
| 2456 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.entity_activities;` |
| 2462 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.entity_custom_field_values;` |
| 2524 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.leads;` |
| 2530 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.lead_stages;` |
| 2795 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.tasks;` |
| 2801 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.operations_workspace_config` |
| 3063 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.platform_configurations;` |
| 3069 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.platform_configuration_vers` |
| 3355 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.platform_feature_flags;` |
| 3361 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.platform_company_licenses;` |
| 3660 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.platform_reactive_signals;` |
| 3666 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.platform_event_timeline;` |
| 3681 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.conversations;` |
| 3688 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.conversation_messages;` |
| 3695 | **SAFE** | Wrapped in DO with duplicate_object/undefined_object handler | `alter publication supabase_realtime add table public.channel_sessions;` |

### CREATE FUNCTION

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 141 | **SAFE** | CREATE OR REPLACE | `create or replace function public.generate_support_ticket_number(p_company_id uu` |
| 155 | **SAFE** | CREATE OR REPLACE | `create or replace function public.write_support_ticket_audit_log()` |
| 464 | **SAFE** | CREATE OR REPLACE | `create or replace function public.ticket_platform_company_metrics_v1(` |
| 954 | **SAFE** | CREATE OR REPLACE | `create or replace function public.handoff_platform_company_metrics_v1(` |
| 1538 | **SAFE** | CREATE OR REPLACE | `create or replace function public.lead_platform_company_metrics_v1(` |
| 1611 | **SAFE** | CREATE OR REPLACE | `create or replace function public.lead_platform_ensure_default_pipeline(p_compan` |
| 1903 | **SAFE** | CREATE OR REPLACE | `create or replace function public.trg_entity_set_updated_at()` |
| 3727 | **SAFE** | CREATE OR REPLACE | `create or replace function public.appointment_platform_company_metrics_v1(` |

### GRANT

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 580 | **SAFE** | GRANT is idempotent in PostgreSQL (re-grant is no-op) | `grant execute on function public.ticket_platform_company_metrics_v1(uuid, timest` |
| 3826 | **SAFE** | GRANT is idempotent in PostgreSQL (re-grant is no-op) | `grant execute on function public.appointment_platform_company_metrics_v1(uuid, t` |

### COMMENT

| Line | Status | Note | SQL (truncated) |
|-----:|:------:|------|-----------------|
| 2466 | **SAFE** | COMMENT ON replaces existing comment | `comment on table public.entity_contacts is 'Universal contacts — attached to any` |
| 3702 | **SAFE** | COMMENT ON replaces existing comment | `comment on table public.conversations is` |
| 3828 | **SAFE** | COMMENT ON replaces existing comment | `comment on function public.appointment_platform_company_metrics_v1 is` |

### ENABLE ROW LEVEL SECURITY (informational — all SAFE)

| Line | Status | Note |
|-----:|:------:|------|
| 234 | **SAFE** | Idempotent — no error if already enabled |
| 235 | **SAFE** | Idempotent — no error if already enabled |
| 841 | **SAFE** | Idempotent — no error if already enabled |
| 842 | **SAFE** | Idempotent — no error if already enabled |
| 843 | **SAFE** | Idempotent — no error if already enabled |
| 844 | **SAFE** | Idempotent — no error if already enabled |
| 845 | **SAFE** | Idempotent — no error if already enabled |
| 846 | **SAFE** | Idempotent — no error if already enabled |
| 847 | **SAFE** | Idempotent — no error if already enabled |
| 848 | **SAFE** | Idempotent — no error if already enabled |
| 1385 | **SAFE** | Idempotent — no error if already enabled |
| 1386 | **SAFE** | Idempotent — no error if already enabled |
| 1387 | **SAFE** | Idempotent — no error if already enabled |
| 1388 | **SAFE** | Idempotent — no error if already enabled |
| 1389 | **SAFE** | Idempotent — no error if already enabled |
| 1390 | **SAFE** | Idempotent — no error if already enabled |
| 1391 | **SAFE** | Idempotent — no error if already enabled |
| 1392 | **SAFE** | Idempotent — no error if already enabled |
| 1393 | **SAFE** | Idempotent — no error if already enabled |
| 1394 | **SAFE** | Idempotent — no error if already enabled |
| 1395 | **SAFE** | Idempotent — no error if already enabled |
| 1396 | **SAFE** | Idempotent — no error if already enabled |
| 1397 | **SAFE** | Idempotent — no error if already enabled |
| 1985 | **SAFE** | Idempotent — no error if already enabled |
| 1986 | **SAFE** | Idempotent — no error if already enabled |
| 1987 | **SAFE** | Idempotent — no error if already enabled |
| 1988 | **SAFE** | Idempotent — no error if already enabled |
| 1989 | **SAFE** | Idempotent — no error if already enabled |
| 1990 | **SAFE** | Idempotent — no error if already enabled |
| 1991 | **SAFE** | Idempotent — no error if already enabled |
| 2605 | **SAFE** | Idempotent — no error if already enabled |
| 2661 | **SAFE** | Idempotent — no error if already enabled |
| 2889 | **SAFE** | Idempotent — no error if already enabled |
| 2890 | **SAFE** | Idempotent — no error if already enabled |
| 3202 | **SAFE** | Idempotent — no error if already enabled |
| 3203 | **SAFE** | Idempotent — no error if already enabled |
| 3204 | **SAFE** | Idempotent — no error if already enabled |
| 3205 | **SAFE** | Idempotent — no error if already enabled |
| 3515 | **SAFE** | Idempotent — no error if already enabled |
| 3516 | **SAFE** | Idempotent — no error if already enabled |
| 3517 | **SAFE** | Idempotent — no error if already enabled |
| 3518 | **SAFE** | Idempotent — no error if already enabled |
| 3519 | **SAFE** | Idempotent — no error if already enabled |
| 3520 | **SAFE** | Idempotent — no error if already enabled |
| 3521 | **SAFE** | Idempotent — no error if already enabled |

---

## Verification method

1. Static scan of `229_production_recovery.sql` (3830 lines).
2. Automated parser (`scripts/audit-229-idempotency.mjs`) validating:
   - DO-block context for policies (`pg_policies`), triggers (`pg_trigger`), publications (`duplicate_object` / `undefined_object`).
   - `IF NOT EXISTS` on tables, indexes, sequences, add-column.
   - `CREATE OR REPLACE` on functions.
3. Local proof: `pnpm supabase db reset` completes with migration 229 present (second apply mostly no-ops).

---

## Sign-off

| Reviewer | Date | Result |
|----------|------|--------|
| | | ☐ Approved for production manual execution (Strategy 1 in RECOVERY_PLAN_v2.md) |

