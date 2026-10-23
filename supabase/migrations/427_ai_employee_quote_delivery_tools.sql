-- Seed AI quote delivery tools (Sales Brain — Quote Delivery & Status Verification).
-- request_send_quote: queues human approval only (tools.execute + quotes.edit). NEVER quotes.send.
-- get_quote_delivery_status: read-only status from quote + quote_send_attempts + metadata.
-- Does NOT widen create_draft_quote permissions. No new send endpoint permissions.
-- Persistence for pending requests uses quotes.metadata.aiSendRequest (no new table).
-- Idempotent upsert on key (same pattern as 426). DO NOT apply blindly across history gaps —
-- apply only on Local after 426 with the project-approved single-migration apply path.

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'request_send_quote',
    'Request Send Quote',
    'Queue a human send-approval request for an internal draft quote. Does not send, approve, or deliver. A teammate with quotes.send must approve via the existing QuoteSendService.',
    'sales', '1.0.0', true,
    '["tools.execute","quotes.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"quoteId":{"type":"string"},"channel":{"type":"string","enum":["email","whatsapp"]}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"deliveryState":{"type":"string"},"sent":{"type":"boolean"},"requiresHumanApproval":{"type":"boolean"},"quoteId":{"type":"string"}}}'::jsonb,
    15000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  ),
  (
    'get_quote_delivery_status',
    'Get Quote Delivery Status',
    'Read real quote delivery state (draft, pending_human_approval, sending, sent, failed) from platform records. Never invents sent.',
    'sales', '1.0.0', true,
    '["tools.execute","quotes.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"quoteId":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"deliveryState":{"type":"string"},"sent":{"type":"boolean"},"quoteStatus":{"type":"string"},"attemptStatus":{"type":"string"}}}'::jsonb,
    10000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category,
  is_enabled = excluded.is_enabled,
  required_permissions = excluded.required_permissions,
  supported_states = excluded.supported_states,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  updated_at = now();

-- Guard: create_draft_quote must remain draft-only (tools.execute + quotes.create).
do $$
declare
  perms jsonb;
begin
  select required_permissions into perms
  from public.tool_definitions
  where key = 'create_draft_quote';
  if perms is null then
    raise notice 'create_draft_quote not present yet — skip widen guard';
    return;
  end if;
  if perms @> '["quotes.send"]'::jsonb
     or perms @> '["quotes.approve"]'::jsonb
     or perms @> '["quotes.delete"]'::jsonb then
    raise exception 'create_draft_quote must not include send/approve/delete permissions';
  end if;
end $$;
