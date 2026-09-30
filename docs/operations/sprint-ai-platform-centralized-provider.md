# Sprint AI-Platform — Centralized AI Provider (Platform-First)

**Priority:** P0 (Platform Architecture)  
**Status:** Implemented — migration 171 + 393 + platform-first ensure + UI readiness

---

## Final architecture

```
                 VALUEOR PLATFORM
                       │
                 AI PROVIDER (OpenAI + encrypted key)
                       │
                ┌──────┴──────┐
                │             │
             Company A      Company B
                │             │
          Chat / Agent   Chat / Agent
                │             │
          AI Employees    AI Employees
                │             │
          Automations     Automations
```

ONE platform provider. ONE platform secret (server-side). MANY tenants. Strict tenant isolation.

### Resolution flow

1. Resolve company + entitlement + permissions
2. `platform_ai_provider_readiness` (non-secret)
3. `ensure_company_platform_ai_provider_connection` → keyless `uses_platform_key=true` binding
4. Server runtime: `platform_resolve_ai_runtime_config` (service_role only) injects API key
5. Execute LLM / tools with companyId-scoped context

Companies are **not** required to enter an OpenAI API key (BYOK is not the default).

---

## Migration 393

| RPC | Purpose | Exposes secret? |
|-----|---------|-----------------|
| `platform_ai_provider_readiness` | Ready / model / keyHint | No |
| `ensure_company_platform_ai_provider_connection` | Auto-create/enable tenant binding | No |

---

## Local verification

```bash
npx tsx scripts/_tmp-apply-393.mts
npx tsx scripts/platform-ai-centralized-provider-verify.mts
cd lib/platform-ai-provider && npm test
```

Live local Chat + Agent LLM paths succeeded against the platform provider (HTTP 200, no `[Simulated]`).

---

## Production note (do not auto-apply)

Configure platform key in Super Admin → Settings → Platform AI.  
Never put the key in `VITE_*` or browser responses.
