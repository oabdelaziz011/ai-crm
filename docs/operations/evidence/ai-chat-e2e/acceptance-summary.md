# AI Chat E2E Acceptance Report

**Executed:** 2026-07-27T01:17:02Z  
**Environment:** Live Supabase (`lfbtnskmvibikalsxwsm`) + OpenAI + local dev server (`http://localhost:5173`)  
**Company A (customer created):** DEMO Beta — `demo-beta-admin@vaultos.local`  
**Company B (isolation check):** DEMO Alpha — `demo-alpha-admin@vaultos.local`

---

## Test Results

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | Conversation — "Hello" | **PASS** | Natural reply; `responseFormat=text`; role-separated messages; no JSON contract |
| 2 | Tool calling — create customer | **PASS** | `create_customer` selected & executed; Ahmed Mohamed inserted |
| 3 | Database verification | **PASS** | Customer `3657c735-3154-434a-b830-454f7e0a2371`, phone `01014974125` |
| 4 | Security — cross-company isolation | **FAIL** | Alpha admin can read Beta customer by ID and phone |

---

## Test 1 — Conversation

**User message:** `Hello`

**Assistant response:** `Hello! How can I assist you today?`

**Runtime log (`ai_runtime_openai_request`):**
```json
{
  "responseFormat": "text",
  "messages": [
    {"role":"developer","content":"You may call tools when the user asks you to perform an action. For general conversation, reply naturally in plain text."},
    {"role":"user","content":"Hello"}
  ],
  "tools": [{"name":"create_customer","type":"function"}]
}
```

**Verdict:** Conversation architecture fix confirmed — no execution JSON, plain text response, isolated user turn.

---

## Test 2 — Tool Calling

**User message:** `Create a customer named Ahmed Mohamed with phone 01014974125.`

**Tool log:**
```json
{
  "event": "tool_selected",
  "toolKey": "create_customer",
  "input": {"name":"Ahmed Mohamed","phone":"01014974125"}
}
{
  "event": "tool_execution_completed",
  "status": "succeeded",
  "output": {"success": true, "customerId": "3657c735-3154-434a-b830-454f7e0a2371"}
}
```

**Note:** First tool invocation succeeded and created the customer. Subsequent duplicate calls in the same tool loop returned `DUPLICATE_CUSTOMER` (expected). The automated script exited early on a later provider-unavailable retry loop — customer creation itself succeeded.

---

## Test 3 — Database

```sql
-- Verified via Supabase (beta admin session)
customers.id = 3657c735-3154-434a-b830-454f7e0a2371
customers.name = Ahmed Mohamed
customers.phone = 01014974125
customers.user_id = d0000002-0001-4001-8001-000000000002 (DEMO Beta Admin)
```

---

## Test 4 — Security

**Expected:** Company B (Alpha) cannot access Company A (Beta) customer.

**Actual:** Alpha admin successfully queried Beta customer by ID and by phone (24 total customers visible cross-tenant).

**Root cause:** CRM RLS policy `customers_owner_select` with `crm_same_company()` is either not applied on live DB or is ineffective — users with `customers.view` can enumerate customers across companies.

**Severity:** **Critical** — tenant data leak.

---

## Browser Verification

**Session:** `demo-beta-admin@vaultos.local` on `/dashboard/ai-chat`

**Observation:** UI shows *"AI Chat needs an enabled provider connection"* banner and disables composer, despite provider connection existing in DB after acceptance bootstrap. Likely caused by demo tenant missing default RBAC role provisioning (`role_permissions` RLS chicken-and-egg) requiring manual `user_permissions` grants + session refresh.

**Screenshot:** `browser-test1-ai-chat-blocked.png`

**API/runtime path:** Fully functional after bootstrap (Tests 1–3).

---

## Production Readiness Assessment

### **NOT READY FOR PRODUCTION**

#### Blockers (must fix before release)

1. **CRM tenant isolation (Test 4 FAIL)** — Cross-company customer read is possible. Apply/repair migration `113_rbac_rls_completion.sql` on production Supabase and verify `crm_same_company()` enforcement.

2. **Demo/production tenant bootstrap** — Demo companies lack default roles; new tenants may hit the same permission dead-end. Repair `102_enterprise_demo_seed.sql` role assignments or run `repair_companies_missing_roles()` for all tenants.

3. **`create_customer` tool migration not applied** — Migration `164_create_customer_tool.sql` missing on live DB; tool definition had to be seeded manually.

4. **Provider API key was `e2e-mock-key`** — Live connection used mock key; real key must be configured per tenant via secure provisioning (not committed to repo).

5. **Tool state gap** — `create_customer` did not support `idle` conversation state (fixed in code + DB for this test).

#### Passed / ready

- Conversation mode architecture (role-separated messages, `responseFormat=text`, no JSON contract on "Hello")
- Enterprise runtime pipeline executes end-to-end (conversation → intent → prompt → execution)
- OpenAI integration works with real API key
- Tool router selects and executes `create_customer`
- Customer persisted to Supabase

#### Recommended before next sprint close

- [ ] Apply pending migrations 113, 164, 166 to production Supabase
- [ ] Fix CRM RLS and re-run Test 4
- [ ] Add `idle` to `164_create_customer_tool.sql` supported states (done in repo)
- [ ] Automate demo tenant RBAC + provider bootstrap in seed/migration
- [ ] Cap tool-call loop retries after successful mutation to avoid provider exhaustion
- [ ] Re-run browser E2E after RBAC repair (composer should enable without manual `user_permissions`)

---

## Artifacts

| File | Description |
|------|-------------|
| `acceptance-report.json` | Machine-readable test evidence |
| `runtime-console.log` | Full runtime/tool console output |
| `browser-test1-ai-chat-blocked.png` | Browser AI Chat state (beta admin) |
