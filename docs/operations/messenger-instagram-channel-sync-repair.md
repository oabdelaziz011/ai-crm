# Messenger / Instagram `company_channels` sync repair

## Permanent fix (this PR)

Migration `464_sync_messenger_instagram_channel_create_if_missing.sql` updates:

- `public.sync_messenger_channel_references(uuid)`
- `public.sync_instagram_channel_references(uuid)`

so settings upsert **creates** a `company_channels` row when none exists (same pattern as WhatsApp `376`, SMS `377`, Email `378`).

Settings hooks also invalidate `companyChannelsQueryKey` after save so the webhook URL card refreshes without a full reload.

**Does not** invent Page IDs, access tokens, or mark channels connected with fabricated credentials. New rows copy only non-empty IDs already present on settings and use `enabled` from settings (default `false` → `pending` / disabled).

## Why Meta verification failed

Bare Meta webhook verify (`GET /api/webhooks/messenger` or `/instagram`) resolves:

1. `hub.verify_token` → settings row (by lookup hash)
2. All non-deleted `company_channels` for that company with catalog key `messenger` / `instagram`
3. **Exactly one** match → HTTP **200** + exact `hub.challenge`
4. Zero or multiple matches → HTTP **403**

Saving settings without a channel left step 2 empty → Meta subscription verification failed.

## Production company `2d27f7fb-c15e-4d60-84e9-1793f36f2172`

### Safe, reversible repair plan (DO NOT RUN without explicit approval)

**Goal:** Ensure one Messenger (and/or Instagram) `company_channels` row exists for this company when settings exist, without inventing Page IDs or rotating tokens.

1. **Read-only discovery (Production, service role / ops SQL):**

```sql
-- Settings presence (no secrets selected)
select company_id, enabled, nullif(trim(page_id), '') is not null as has_page_id,
       webhook_verify_token_lookup_hash <> '' as has_verify_hash,
       updated_at
from public.company_messenger_settings
where company_id = '2d27f7fb-c15e-4d60-84e9-1793f36f2172';

select company_id, enabled,
       nullif(trim(page_id), '') is not null as has_page_id,
       nullif(trim(instagram_business_account_id), '') is not null as has_ig_account,
       webhook_verify_token_lookup_hash <> '' as has_verify_hash,
       updated_at
from public.company_instagram_settings
where company_id = '2d27f7fb-c15e-4d60-84e9-1793f36f2172';

-- Existing channels
select cc.id, ch.key, cc.is_enabled, cc.status, cc.deleted_at,
       cc.configuration ? 'pageId' as has_page_id_cfg,
       cc.configuration->>'credentialsSource' as credentials_source
from public.company_channels cc
join public.communication_channels ch on ch.id = cc.channel_id
where cc.company_id = '2d27f7fb-c15e-4d60-84e9-1793f36f2172'
  and ch.key in ('messenger', 'instagram')
order by ch.key, cc.created_at;
```

2. **Apply migration 464 on Production** (standard migrate path). The migration’s backfill `DO` block calls sync for every company with Messenger/Instagram settings — including this one when present.

3. **If migration is already applied but the row is still missing** (edge case), reversible ops-only call:

```sql
-- service_role / maintenance window only
begin;
select public.sync_messenger_channel_references('2d27f7fb-c15e-4d60-84e9-1793f36f2172');
select public.sync_instagram_channel_references('2d27f7fb-c15e-4d60-84e9-1793f36f2172');
-- verify counts = 1 each when settings exist
rollback; -- dry run first; replace with commit only after approval
```

4. **Rollback:** soft-delete any channel row created by the sync (`deleted_at = now()`) if the company must return to the previous state. Do **not** delete settings or tokens.

5. **Never:** invent `page_id`, paste a guessed Meta Page ID, copy another company’s tokens, or enable the channel without owner confirmation.

### Remaining Production action to complete Meta verification

After migration 464 is deployed and the company has **exactly one** Messenger channel linked to settings:

1. Confirm Meta App webhook callback URL points at the Production bare path (e.g. `https://…/api/webhooks/messenger`) **or** the channel-scoped URL shown in Settings.
2. Confirm the verify token in Meta matches the company Messenger settings verify token (do not rotate unless intended).
3. In Meta Developer Dashboard → Messenger → Webhooks, re-run **Verify and save**. Expect HTTP 200 with the challenge echoed.
4. Subscribe to the required Messenger fields (`messages`, `messaging_postbacks`, etc. as currently used by ValueOR).
5. Only then send a test message from an authorized Page / test user.

Until steps 1–3 succeed, Meta Access / webhook subscription for that Page remains incomplete even if settings look saved in ValueOR.
