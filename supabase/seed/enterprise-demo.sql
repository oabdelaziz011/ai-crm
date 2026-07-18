-- VaultOS Enterprise Demo Environment
-- Idempotent re-seed (safe to run multiple times):
select public.seed_enterprise_demo_v1();

-- Safe removal of all demo data:
-- select public.teardown_enterprise_demo_v1();
