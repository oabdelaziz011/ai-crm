-- Fix support ticket number collisions after DB import/restore.
-- Root cause: support_ticket_number_seq can lag behind existing ticket_number
-- values (e.g. local import), so generate_support_ticket_number returns
-- TKT-00000N that already exists → unique (company_id, ticket_number) fails
-- during AI email routing ticket create.

create or replace function internal.generate_support_ticket_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = internal, public
as $$
declare
  v_seq bigint;
  v_max_existing bigint;
  v_candidate text;
  v_exists boolean;
  v_attempts integer := 0;
begin
  -- Keep the shared sequence ahead of any existing numeric ticket suffixes.
  select coalesce(
    max(nullif(regexp_replace(ticket_number, '\D', '', 'g'), '')::bigint),
    0
  )
  into v_max_existing
  from public.support_tickets;

  if v_max_existing > 0 then
    perform setval(
      'public.support_ticket_number_seq',
      greatest(
        v_max_existing,
        (select last_value from public.support_ticket_number_seq)
      ),
      true
    );
  end if;

  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 25 then
      raise exception 'Unable to allocate unique support ticket number';
    end if;

    v_seq := nextval('public.support_ticket_number_seq');
    v_candidate := 'TKT-' || lpad(v_seq::text, 6, '0');

    select exists (
      select 1
      from public.support_tickets st
      where st.company_id = p_company_id
        and st.ticket_number = v_candidate
    ) into v_exists;

    exit when not v_exists;
  end loop;

  return v_candidate;
end;
$$;

-- Public wrapper stays security invoker → internal (migration 289 contract).
create or replace function public.generate_support_ticket_number(p_company_id uuid)
returns text
language sql
volatile
security invoker
set search_path to public, internal
as $w$
  select internal.generate_support_ticket_number(p_company_id);
$w$;

revoke all on function public.generate_support_ticket_number(uuid) from public;
revoke all on function internal.generate_support_ticket_number(uuid) from public;
grant execute on function public.generate_support_ticket_number(uuid) to service_role;
grant execute on function internal.generate_support_ticket_number(uuid) to service_role;
grant execute on function public.generate_support_ticket_number(uuid) to authenticated;
grant execute on function internal.generate_support_ticket_number(uuid) to authenticated;

-- One-shot resync for environments already lagging (idempotent with the function logic).
do $$
declare
  v_max_existing bigint;
begin
  select coalesce(
    max(nullif(regexp_replace(ticket_number, '\D', '', 'g'), '')::bigint),
    0
  )
  into v_max_existing
  from public.support_tickets;

  if v_max_existing > 0 then
    perform setval(
      'public.support_ticket_number_seq',
      greatest(
        v_max_existing,
        (select last_value from public.support_ticket_number_seq)
      ),
      true
    );
  end if;
end;
$$;
