# RBAC E2E Validation Report

**Date:** 2026-07-18
**Result:** 52/52 passed (100%)

| Category | Test | Result | Detail |
|---|---|---|---|
| Static | Dashboard routes declare permissions | PASS | users.view + audit_logs.view |
| Static | Users page separates view vs edit | PASS | user-permissions helpers wired |
| Static | AI Assistant no role-name bypass | PASS | removed hardcoded bypasses |
| Static | Settings route guard exists | PASS | settings-route-guard.tsx |
| Permission RPC | Platform Owner → users.view | PASS | expected=true actual=true |
| Permission RPC | Platform Owner → users.edit | PASS | expected=true actual=true |
| Permission RPC | Platform Owner → roles.view | PASS | expected=true actual=true |
| Permission RPC | Platform Owner → audit_logs.view | PASS | expected=true actual=true |
| Permission RPC | Platform Owner → companies.view | PASS | expected=true actual=true |
| Permission RPC | Platform Owner → channels.view | PASS | expected=true actual=true |
| Permission RPC | Platform Owner → billing.view | PASS | expected=true actual=true |
| Permission RPC | Company Admin → users.view | PASS | expected=true actual=true |
| Permission RPC | Company Admin → users.edit | PASS | expected=true actual=true |
| Permission RPC | Company Admin → roles.view | PASS | expected=true actual=true |
| Permission RPC | Company Admin → audit_logs.view | PASS | expected=true actual=true |
| Permission RPC | Company Admin → companies.view | PASS | expected=false actual=false |
| Permission RPC | Company Admin → channels.view | PASS | expected=true actual=true |
| Permission RPC | Company Admin → billing.view | PASS | expected=false actual=false |
| Permission RPC | Finance Manager → users.view | PASS | expected=false actual=false |
| Permission RPC | Finance Manager → users.edit | PASS | expected=false actual=false |
| Permission RPC | Finance Manager → billing.view | PASS | expected=false actual=false |
| Permission RPC | Finance Manager → billing.view_own | PASS | expected=true actual=true |
| Permission RPC | Finance Manager → billing.manage_own | PASS | expected=true actual=true |
| Permission RPC | Finance Manager → billing.contact.edit_own | PASS | expected=true actual=true |
| Permission RPC | Finance Manager → workspace.view | PASS | expected=true actual=true |
| Permission RPC | Support Agent → users.view | PASS | expected=false actual=false |
| Permission RPC | Support Agent → customers.view | PASS | expected=true actual=true |
| Permission RPC | Support Agent → customers.edit | PASS | expected=true actual=true |
| Permission RPC | Support Agent → ai_chat.view | PASS | expected=true actual=true |
| Permission RPC | Support Agent → ai_chat.use | PASS | expected=true actual=true |
| Permission RPC | Support Agent → bookings.view | PASS | expected=true actual=true |
| Permission RPC | Support Agent → billing.view_own | PASS | expected=true actual=true |
| Permission RPC | Sales Manager → customers.view | PASS | expected=true actual=true |
| Permission RPC | Sales Manager → customers.create | PASS | expected=true actual=true |
| Permission RPC | Sales Manager → bookings.create | PASS | expected=true actual=true |
| Permission RPC | Sales Manager → invoices.view | PASS | expected=true actual=true |
| Permission RPC | Sales Manager → reports.view | PASS | expected=true actual=true |
| Permission RPC | Sales Manager → workspace.view | PASS | expected=true actual=true |
| Permission RPC | Sales Manager → users.edit | PASS | expected=false actual=false |
| Permission RPC | Employee → users.view | PASS | expected=false actual=false |
| Permission RPC | Employee → users.edit | PASS | expected=false actual=false |
| Permission RPC | Employee → roles.view | PASS | expected=false actual=false |
| Permission RPC | Employee → audit_logs.view | PASS | expected=false actual=false |
| Permission RPC | Employee → channels.view | PASS | expected=false actual=false |
| Permission RPC | Employee → ai_chat.view | PASS | expected=false actual=false |
| RLS | Employee audit_logs SELECT denied | PASS | rows=0 |
| RLS | Company Admin audit_logs SELECT allowed | PASS | rows=1 |
| RLS | Employee company_channels SELECT denied | PASS | rows=0 |
| RLS | Company Admin company_channels SELECT allowed | PASS | rows=1 |
| RLS | Employee other profiles SELECT denied | PASS | rows=0 |
| RLS (post-111) | Employee company_channels SELECT denied when channels.view absent | PASS | rows=0 (apply migrations 111+112 to enforce) |
| Edge Function | provision-user employee rejection | PASS | status=403 body={"error":"Forbidden"} |
