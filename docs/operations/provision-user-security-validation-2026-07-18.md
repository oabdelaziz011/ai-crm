# provision-user Security Validation

**Date:** 2026-07-18T15:04:40.698Z
**Summary:** 1/7 passed

| Test | Result | Detail |
|---|---|---|
| missing users.edit permission | PASS | status=403 body={"error":"Forbidden"} |
| fake companyId mismatch | FAIL | status=400 body={"error":"Email address \"security-provision-1784387073896-newt5g@example.com\" is invalid"} |
| role from another company | FAIL | status=400 body={"error":"email rate limit exceeded"} |
| system role assignment attempt (cross-tenant) | FAIL | status=400 body={"error":"email rate limit exceeded"} |
| target user from another company | FAIL | status=409 body={"error":"User already exists","code":"email_exists"} |
| valid same-company role | FAIL | status=400 body={"error":"email rate limit exceeded"} |
| super admin path | FAIL | status=400 body={"error":"email rate limit exceeded"} |
