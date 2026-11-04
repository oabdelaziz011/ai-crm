-- =============================================================================
-- Operator index for session-table cutover (no executable statements)
-- =============================================================================
-- Run these in the hosted Supabase SQL editor as the DATABASE_URL role:
--
-- 1) READ-ONLY (SELECT only):
--    supabase/ops/443_express_sessions_readonly_preflight.sql
--
-- 2) APPLY after explicit approval (CREATE + temporary insert/delete probe):
--    supabase/ops/443_express_sessions_apply.sql
--
-- Source of truth migration (tracked):
--    supabase/migrations/443_api_runtime_express_sessions.sql
--
-- public.user_sessions must remain untouched.
-- =============================================================================

select 'Use 443_express_sessions_readonly_preflight.sql then 443_express_sessions_apply.sql' as next_step;
