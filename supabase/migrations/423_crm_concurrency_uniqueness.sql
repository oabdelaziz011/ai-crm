-- CRM concurrency: serialize concurrent Smart Capture / product-interest apply races
-- without blocking legitimate multiple open leads (different conversations) or
-- legitimate multiple opportunities (other sources / future deals).
--
-- Apply only against local/dev — never production from agent tooling.

-- One open (non-terminal) lead per conversation within a company.
-- Closed/converted leads may retain conversation_id; a new open lead for the same
-- conversation is still allowed because terminal lifecycles are excluded.
create unique index if not exists leads_one_open_per_conversation_idx
  on public.leads (company_id, conversation_id)
  where deleted_at is null
    and conversation_id is not null
    and lower(coalesce(lifecycle_status, 'new')) not in (
      'converted',
      'won',
      'lost',
      'disqualified',
      'archived',
      'closed',
      'purchased'
    );

comment on index public.leads_one_open_per_conversation_idx is
  'Concurrency guard: at most one open lead per conversation. Terminal lifecycles excluded so a new engagement can open after close.';

-- One open opportunity created from stored product-interest apply per lead.
-- Does not constrain opportunities created by other product/sales flows.
create unique index if not exists opportunities_one_open_product_interest_per_lead_idx
  on public.opportunities (company_id, lead_id)
  where deleted_at is null
    and lead_id is not null
    and won_at is null
    and lost_at is null
    and coalesce(metadata->>'source', '') = 'product_interest_after_qualify';

comment on index public.opportunities_one_open_product_interest_per_lead_idx is
  'Concurrency guard for applyStoredProductInterestAfterQualify: one open product-interest opportunity per lead.';

-- One active line item per (opportunity, product). Prevents concurrent attach races
-- after opportunity create converges.
create unique index if not exists opportunity_line_items_one_product_per_opp_idx
  on public.opportunity_line_items (company_id, opportunity_id, product_id)
  where deleted_at is null;

comment on index public.opportunity_line_items_one_product_per_opp_idx is
  'Concurrency guard: at most one active line item for a given product on an opportunity.';
