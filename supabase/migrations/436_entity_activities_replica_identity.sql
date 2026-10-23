-- The leads workspace channel filters entity_activities on tenant_id.
-- Replica identity DEFAULT puts only the primary key in UPDATE/DELETE WAL,
-- and a filter on a missing column rejects that binding. One rejected
-- binding drops the rest of the channel, including leads.
-- FULL identity lets the tenant filter match without new grants.

alter table public.entity_activities replica identity full;
