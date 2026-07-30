-- Sprint 6.1: Platform AI unification — add ai_agents feature key.

alter table public.platform_ai_feature_flags
  drop constraint if exists platform_ai_feature_flags_feature_key_check;

alter table public.platform_ai_feature_flags
  add constraint platform_ai_feature_flags_feature_key_check
  check (feature_key in (
    'ai_chat',
    'tool_calling',
    'knowledge',
    'automation',
    'voice',
    'embeddings',
    'ai_analytics',
    'ai_agents'
  ));

comment on constraint platform_ai_feature_flags_feature_key_check on public.platform_ai_feature_flags is
  'Allowed Platform AI tenant feature keys. ai_agents added Sprint 6.1 for AI Agents orchestration gating.';
