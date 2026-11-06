# Phase 3 mobile architecture

ValueOR mobile is a React Native application in `artifacts/mobile-app`. It is not a WebView, PWA, or embedded copy of the website. Android and iOS share one Expo Router codebase.

## Backend

The web application authenticates with Supabase Auth and reads tenant data through the user JWT. Row Level Security remains the data boundary. The API server authorizes privileged operations with `requireSupabaseAuth` and, on a tenant hostname, `parseCompanyHost`.

Native clients call the API host, so the hostname of the HTTP connection is not the company host. `GET /api/mobile/session` accepts the existing user access token plus `X-ValueOR-Instance`. The server normalizes that value, resolves the company from the subdomain, and applies the same membership, inactive-company, and Super Admin context rules as the web host gate. The response company id is produced by that lookup. A client-supplied company id is ignored.

Platform hosts do not become Super Admin access by themselves. A tenant user who enters `app.valueor.org` is rejected. A Super Admin without a live `platform_admin_contexts` row is rejected for a tenant host. Existing web routes and cookie sessions are unchanged.

The mobile client stores the refresh session in `expo-secure-store`, split into chunks because a Supabase session can exceed the single-item limit. The publishable Supabase key is read from `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A service-role key is refused at startup. No service-role key is bundled.

Module visibility uses permission codes returned by `load_user_auth_context` for that user. Hiding a tab is not the authorization check. Lists and writes always filter by the server-issued company id, and the database policies still apply.

## Navigation

Expo Router provides the native navigation. After a tenant session, the bottom tabs are Dashboard, CRM, Inbox, Tickets, and More. Email, company settings, notifications, AI, and profile are stack screens. Arabic sets the root layout to RTL. English and German stay LTR. Light, dark, and system themes use the ValueOR teal `#0D9488`.

## Distribution

Android application id: `org.valueor.mobile`. Version `0.1.0`, version code `1`. Minimum Android API configured with `expo-build-properties` is 24. Signing material stays outside git (`android-signing.properties`, `*.keystore`).

Produce a signed release APK only after a real keystore exists:

```text
cd artifacts/mobile-app
pnpm exec expo prebuild --platform android
```

Point `android/gradle.properties` at the untracked signing file, then from `artifacts/mobile-app/android` run `./gradlew assembleRelease`. Do not publish to Google Play from this phase.

iOS bundle id: `org.valueor.mobile`. The configured deployment target is iOS 16.4, which is the minimum accepted by Expo SDK 58. Distribution for a commercial SaaS serving customers in Egypt is the Apple App Store. TestFlight is for invited testers and builds expire. Ad Hoc is limited to registered devices. The Apple Developer Enterprise Program is for distributing an internal app to a company's own employees, not for selling to unrelated customer companies. A public IPA URL cannot be installed by arbitrary iPhones outside Apple's process. No Apple certificates are created in this phase.

The login page reads `VITE_VALUEOR_ANDROID_APK_URL` and `VITE_VALUEOR_ANDROID_VERSION`. An Android button and QR code render only for an `https` URL ending in `.apk`. Otherwise the page explains that the signed file is not available yet. The iPhone section describes App Store distribution and does not offer an IPA link.

## What the mobile client calls

Reads use the signed-in Supabase client against the existing tables. Creates and updates for leads, opportunities, tickets, and conversations go through `POST /api/mobile/records`, which resolves the company from `X-ValueOR-Instance` and then calls the existing lead, opportunity, ticket, and conversation command services with the user JWT. A confirmed channel message returns the existing `/api/omnichannel/outbound/dispatch` payload; the server route itself does not call a provider. Email AI drafts stay unsent. `POST /api/mobile/push-token` authenticates the caller and refuses to store a token until delivery can be verified. No storage bucket was added.
