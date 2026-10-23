-- Publish the opportunity tables the workspace already subscribes to.
-- They use company_id plus opportunities.view RLS. No extra grants.
-- Kanban and Lead360 read tags from leads.tags, so the side table lead_tags
-- stays out of the publication.

do $$
begin
  begin
    alter publication supabase_realtime add table public.opportunities;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.opportunity_history;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.opportunity_stages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

end $$;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_tags'
  ) then
    alter publication supabase_realtime drop table public.lead_tags;
  end if;
end $$;

-- Filtered UPDATE/DELETE events only include the primary key unless the
-- replica identity is FULL, so a company_id filter never matches them.
-- Kanban and Lead360 read tags from leads.tags, so lead_tags is not published.
alter table public.leads replica identity full;
alter table public.opportunities replica identity full;
alter table public.opportunity_history replica identity full;
alter table public.opportunity_stages replica identity full;
