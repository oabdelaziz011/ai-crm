-- Allow companies to classify a bookable person as an instructor or an engineer.
-- Existing resource rows keep their current type.

alter table public.scheduling_resources
  drop constraint if exists scheduling_resources_resource_type_check;

alter table public.scheduling_resources
  add constraint scheduling_resources_resource_type_check
  check (resource_type in (
    'doctor',
    'employee',
    'therapist',
    'instructor',
    'engineer',
    'room',
    'chair',
    'equipment',
    'other'
  ));
