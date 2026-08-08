-- Sprint 4.3: CRM Kanban stabilization — pipeline backward stage movement.
-- Additive only; default TRUE so kanban can move leads to earlier stages.

alter table public.lead_pipelines
  add column if not exists allow_backward_stage_movement boolean not null default true;

comment on column public.lead_pipelines.allow_backward_stage_movement is
  'When true, leads may move to earlier lifecycle stages in the same pipeline (Kanban). Default true.';
