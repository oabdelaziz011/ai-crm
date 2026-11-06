# ValueOR mobile release progress

Updated: 2026-11-01. This file records phase status. It does not contain credentials or a Production project identifier.

## Baseline

- Branch: `main`
- HEAD: `f7579ec9cbe5260d6588384ff9b8be3a43030bf6`
- The working tree already contains the Phase 1 through Phase 3.4.2 changes. Those changes stay uncommitted.
- Mobile app: Expo SDK 58, `org.valueor.mobile`, version `0.1.0`, Android versionCode `1`, scheme `valueor`.
- EAS project is linked. No preview APK exists. No device validation has been run.

## Phase status

| Phase | Status | Evidence | Next action |
|---|---|---|---|
| 3.4.2 Multilingual | IMPLEMENTED | 169 catalog keys. Unit tests passed. Native RTL is not device-verified. | Physical device after a staging build. |
| 3.5 Staging | FOUNDATION COMPLETE — FREE-TIER PROJECT APPROVAL REQUIRED | Staging API is specified on this PC with a temporary Cloudflare tunnel. No Supabase project has been created. | Owner checks the free-project allowance and creates the staging project. |
| 3.6 Android preview APK | BLOCKED | Preview profile requires staging HTTPS and rejects Production hosts. EAS preview environment is empty. | Approval for a paid build after staging values exist. |
| 3.7 Android device validation | NOT STARTED | No APK and no device. | Depends on 3.6. |
| 3.8 Language acceptance | NOT STARTED | Implementation exists. Device pass does not. | Depends on 3.7. |
| 3.9 iOS TestFlight | NOT STARTED | No Apple signing assets in this phase. | Depends on Android validation and an Apple Developer account. |
| 4 Production audit | NOT STARTED | Read-only audit waits until staging and mobile validation have a target. | After 3.9, or earlier if the owner asks for the audit first. |
| 5 Fly.io deployment | NOT STARTED | No deployment in this phase. | Explicit approval of cost, DNS, and migrations. |

## Mobile Environment Architecture

The web application stays Local and Production. It does not read `.env.staging` and it does not gain a staging deployment.

The mobile application has three environments:

| Profile | EAS environment | API and database |
|---|---|---|
| development | development | Local API and local Supabase. Desktop uses `127.0.0.1`. The Android emulator uses `10.0.2.2`. A physical phone uses the desktop LAN address. |
| preview | preview | Staging API and staging Supabase, both HTTPS. |
| production | production | The existing Production API and Production Supabase. |

The same API implementation, migrations, RBAC, and RLS are used in every environment. The no-cost staging API is `pnpm dev:api:staging` on this PC, port 3011, loopback only, backed by a separate Supabase Free project. A Cloudflare quick tunnel supplies the temporary HTTPS URL for the phone. Fly.io and Render are not part of this step. The Production `fly.toml` and `deploy/vps/start-api.mjs` are unchanged.

Selection rules:

- `VALUEOR_ENV=local` reads `.env.localstack` and rejects a hosted Supabase URL.
- `VALUEOR_ENV=staging` reads only `.env.staging`. A missing file stops startup. Staging rejects the Production project, the Production API hosts, loopback, and development secret placeholders.
- `VALUEOR_ENV=production` reads the existing Production environment and rejects a different hosted Supabase project.
- The mobile preview profile rejects Production endpoints. The mobile production profile rejects staging endpoints. A service-role key is rejected before it can enter the public mobile config.
- The Supabase URL and the API URL must belong to the same environment.

No staging URL has been supplied. The setup package is `docs/operations/mobile-staging-setup.md`.

## Approval required

1. In the Supabase dashboard, confirm a free project can still be created. If it cannot, stop. Do not upgrade yet.
2. Create that project. Do not reuse the Production project or its data.
3. Fill `.env.staging` from `.env.staging.example`. Keep the service-role key on the server.
4. Approve applying the migration sequence to that empty database, then approve the synthetic seed.
5. Install `cloudflared` if it is not already on the PC. No Cloudflare DNS change is required for the quick tunnel.
6. A paid preview build stays optional and is not required for the first phone test.
