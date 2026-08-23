-- Phase 5Q.5: per-AI-Employee welcome message (first-contact greeting)

alter table public.ai_employees
  add column if not exists welcome_message text not null default '';

alter table public.ai_employees
  drop constraint if exists ai_employees_welcome_message_length_check;

alter table public.ai_employees
  add constraint ai_employees_welcome_message_length_check
  check (char_length(welcome_message) <= 1000);

comment on column public.ai_employees.welcome_message is
  'First-contact greeting sent by this AI Employee. Empty string means use platform default at runtime.';
