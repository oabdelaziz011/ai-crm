-- Sprint 6.8.2: AI Employee runtime configuration persistence (registry layer only).

alter table public.ai_employees
  add column if not exists prompt_version_label text not null default 'v1',
  add column if not exists runtime_configuration jsonb not null default jsonb_build_object(
    'executionTimeoutMs', 120000,
    'retryCount', 2,
    'rateLimitPerMinute', 60,
    'maxConcurrency', 1,
    'disabledToolKeys', '[]'::jsonb,
    'runtimeFlags', jsonb_build_object(
      'streaming', true,
      'memoryMode', 'session',
      'confirmationPolicy', 'destructive',
      'recoveryEnabled', true,
      'checkpointEnabled', true
    ),
    'retrievalPolicy', jsonb_build_object(
      'topK', 5,
      'minScore', 0.7,
      'priority', 'balanced'
    )
  );

comment on column public.ai_employees.runtime_configuration is
  'Employee runtime limits and flags (Sprint 6.8.2). Execution remains in agent-runtime.';
comment on column public.ai_employees.prompt_version_label is
  'Registry-managed prompt version label for employee profiles (Sprint 6.8.2).';
