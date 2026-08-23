-- AI Employee session timeout (minutes) for WhatsApp engagement boundaries.
-- Stored in ai_employees.runtime_configuration.sessionTimeoutMinutes (default 1440 = 24h).

comment on column public.ai_employees.runtime_configuration is
  'Employee runtime limits and flags. sessionTimeoutMinutes controls WhatsApp AI Employee engagement timeout (minutes).';

alter table public.ai_employees
  alter column runtime_configuration set default jsonb_build_object(
    'executionTimeoutMs', 120000,
    'retryCount', 2,
    'rateLimitPerMinute', 60,
    'maxConcurrency', 1,
    'sessionTimeoutMinutes', 1440,
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
