# Password Email Flow — Live E2E Execution Report

**Date:** 2026-07-18  
**Project:** `lfbtnskmvibikalsxwsm`  
**Executed by:** `scripts/password-email-flow-e2e.mts` + `scripts/password-email-flow-followup.mjs`

---

## Executive summary

| Flow | Frontend/API result | GoTrue result | Email sent? |
|------|---------------------|---------------|-------------|
| **Password reset** | HTTP **200** `{}` | `user_recovery_requested` **200**; `recovery_sent_at` set | GoTrue accepted send (built-in mailer) |
| **User invite** | Edge Function **400** | `/invite` **429** `over_email_send_rate_limit` | **No** — blocked by rate limit before send |

**Root cause:** Supabase Auth **email send rate limit** (`rate_limit_email_sent: 2`) on the **built-in mailer** (Custom SMTP disabled).  
**Failing component:** **Supabase GoTrue** (`/invite`, and duplicate `/recover` calls).  
**VaultOS codebase:** Not the failing layer for either flow in this test.

---

## 1. Frontend ↔ Dashboard project linkage

| Field | Value |
|-------|-------|
| Frontend `VITE_SUPABASE_URL` | `https://lfbtnskmvibikalsxwsm.supabase.co` |
| Project ref (from URL) | `lfbtnskmvibikalsxwsm` |
| Dashboard / linked CLI project ref | `lfbtnskmvibikalsxwsm` |
| **Match** | **Yes** |

---

## 2. Password reset (live)

**Test email:** `oabdelaziz011@gmail.com` (existing user)  
**Runtime `redirectTo`:** `http://localhost:5173/auth/callback?next=%2Freset-password`  
**Code path:** `forgot-password.tsx:37-39`, `use-users-management.ts:182-184`

### HTTP request

```http
POST https://lfbtnskmvibikalsxwsm.supabase.co/auth/v1/recover
apikey: sb_publishable_qCethJDaZmsLunqIz7GCdQ_B_GBURhH
Content-Type: application/json

{"email":"oabdelaziz011@gmail.com","redirect_to":"http://localhost:5173/auth/callback?next=%2Freset-password"}
```

### HTTP response

| Field | Value |
|-------|-------|
| Status | **200** |
| Body | `{}` |

### SDK second call (duplicate, same run)

| Field | Value |
|-------|-------|
| Status | **429** |
| Error | `For security purposes, you can only request this after 58 seconds.` |

### `auth.users` after reset

| email | recovery_sent_at (before) | recovery_sent_at (after) |
|-------|---------------------------|--------------------------|
| oabdelaziz011@gmail.com | `null` | **`2026-07-18 13:48:30.129389+00`** |

### Auth log (Supabase Authentication Logs)

```json
{
  "auth_event": { "action": "user_recovery_requested", "actor_username": "oabdelaziz011@gmail.com" },
  "path": "/recover",
  "status": 200,
  "time": "2026-07-18T13:48:31Z"
}
```

**Verdict:** Password reset **succeeded** at GoTrue. Frontend did not fail. Duplicate rapid requests hit per-user cooldown (429).

---

## 3. User invite (live)

**Admin:** `demo-platform@vaultos.local` (signed in successfully)  
**Test email:** `oabdelaziz011+e2e1784382511774@gmail.com`  
**Runtime `redirectTo`:** `http://localhost:5173/auth/callback?next=%2Freset-password`  
**Code path:** `use-users-management.ts:122-135` → `provision-user/index.ts:150-159`

### Edge Function request body

```json
{
  "email": "oabdelaziz011+e2e1784382511774@gmail.com",
  "fullName": "E2E Invite Test",
  "companyId": "7f017b82-20ab-4fb1-84ca-f686e1d026b8",
  "roleId": "f5ec92f2-a65c-4b79-9b27-d2ee124b240c",
  "isActive": true,
  "redirectTo": "http://localhost:5173/auth/callback?next=%2Freset-password"
}
```

### Edge Function / `inviteUserByEmail` response

| Field | Value |
|-------|-------|
| HTTP status | **400** |
| Body | `{ "error": "email rate limit exceeded" }` |
| SDK wrapper | `FunctionsHttpError: Edge Function returned a non-2xx status code` |

### Follow-up: allow-listed vs localhost redirect (both blocked by same error)

| redirectTo | Status | Body |
|------------|--------|------|
| `http://localhost:5173/auth/callback?next=%2Freset-password` | 400 | `{ "error": "email rate limit exceeded" }` |
| `http://192.168.1.10:5173/auth/callback?next=%2Freset-password` | 400 | `{ "error": "email rate limit exceeded" }` |

### Auth log

```json
{
  "auth_event": { "action": "user_invited", "traits": { "user_email": "oabdelaziz011+e2e1784382511774@gmail.com" } },
  "path": "/invite",
  "error_code": "over_email_send_rate_limit",
  "error": "429: email rate limit exceeded",
  "status": 429,
  "time": "2026-07-18T13:48:33Z"
}
```

No invited user row persisted in `auth.users` after failure.

**Verdict:** Invite **failed at GoTrue** before email queue/send. Edge function correctly surfaced the error. **Not a VaultOS routing/code defect** in this run.

---

## 4. Authentication Logs inspection

| Question | Password reset | User invite |
|----------|----------------|-------------|
| Auth event created? | **Yes** — `user_recovery_requested` | **Yes** — `user_invited` |
| Email queued/sent? | GoTrue **200** + `recovery_sent_at` set | **No** — **429** `over_email_send_rate_limit` |
| GoTrue error | None on first request | **`429: email rate limit exceeded`** |

Live project settings (Management API):

| Setting | Value |
|---------|-------|
| `site_url` | `http://192.168.1.10:5173` |
| `uri_allow_list` | `http://192.168.1.10:5173/auth/callback`, `/reset-password`, `/forgot-password` |
| `smtp_host` | `null` (Custom SMTP **off**) |
| `rate_limit_email_sent` | **`2`** |
| `audit_log_disable_postgres` | `true` (explains empty `auth.audit_log_entries`; Analytics `auth_logs` still works) |

---

## 5. Why logs were empty in earlier investigation

Earlier probes queried a 14-day window before live traffic or hit Analytics backend errors on filtered SQL. **This E2E run produced log rows** within minutes of the requests. Empty Postgres `auth.audit_log_entries` is expected because `audit_log_disable_postgres: true`.

---

## 6. If Auth log exists but no email arrives

| Flow | Auth log | Inbox | Determination |
|------|----------|-------|---------------|
| **Reset** | 200, `recovery_sent_at` set | Not verified in automation | GoTrue **accepted** send via **built-in mailer**. Non-arrival would be **provider/deliverability/spam**, not frontend failure. |
| **Invite** | 429 rate limit | N/A | GoTrue **rejected before send**. Not SMTP/template/spam — **rate limit**. |

---

## 7. Frontend failure?

**No.** Neither flow failed in VaultOS application code during this test.

- Reset: API returned 200; DB timestamp updated.
- Invite: Edge function returned GoTrue error verbatim; failure originates in **Supabase Auth**.

---

## Root cause

**Supabase Auth built-in email rate limit (`rate_limit_email_sent: 2`) was exhausted during testing**, causing invite sends to fail with `over_email_send_rate_limit`. Password reset succeeded once, then duplicate calls returned 429.

Secondary configuration gaps (not the immediate failure in this run):

- Custom SMTP not configured (`smtp_host: null`).
- Redirect allow list only includes `192.168.1.10:5173` (runtime often uses `localhost:5173`); recover still returned 200 in this test.

---

## Exact failing component

**Supabase GoTrue email rate limiter** on project `lfbtnskmvibikalsxwsm`  
Path: `POST /auth/v1/invite` → `error_code: over_email_send_rate_limit`

---

## Required fix

### Supabase Dashboard (required — not fixable in VaultOS code)

1. **Authentication → Emails → SMTP Settings**
   - Enable **Custom SMTP** (SendGrid, Resend, Amazon SES, etc.).
   - Set sender domain with SPF/DKIM.

2. **Authentication → Rate Limits** (or Auth config)
   - Raise **`rate_limit_email_sent`** above `2` for production, **or** rely on custom SMTP provider limits after SMTP is enabled.

3. **Authentication → URL Configuration**
   - **Site URL:** your real production origin (not only `http://192.168.1.10:5173`).
   - **Redirect URLs:** add every origin you use, including:
     - `http://localhost:5173/auth/callback`
     - `http://127.0.0.1:5173/auth/callback`
     - Production URL + `/auth/callback`
   - Include query-string callback if your app sends `?next=%2Freset-password`.

4. Wait for the current rate-limit window to expire before re-testing invites (or configure SMTP first).

### VaultOS codebase

**No code change applied** — live failure is entirely at Supabase Auth configuration/limits. Application paths executed correctly.

---

## Re-run

```bash
cd artifacts/login-app
npx tsx ../../scripts/password-email-flow-e2e.mjs
node ../../scripts/password-email-flow-followup.mjs   # requires keytar + NODE_PATH to temp probe dir
```
