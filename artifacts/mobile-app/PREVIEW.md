# Android preview build

This file explains how to configure the existing ValueOR mobile app for desktop development and for an installable Android preview APK. It does not contain credentials.

## Public variables

Copy `.env.example` to `.env` in this directory. Set only these variables:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use the Supabase publishable key. Do not put a service-role key, a database password, or a private API secret in this file. The app refuses to start when the publishable key is a service-role credential. Preview and production builds also refuse that key.

## Which address to use

| Where the app runs | Profile | API and Supabase address |
|---|---|---|
| Desktop Metro on this computer | development or local | `http://127.0.0.1:3001` and local Supabase on `127.0.0.1`. A phone cannot use this address. |
| Android emulator on this computer | development | `http://10.0.2.2:3001` and local Supabase through `10.0.2.2`. `127.0.0.1` is the emulator itself, not the desktop. |
| Physical phone on the same LAN | development | The desktop's LAN address, such as `http://192.168.x.x:3001`, and the same host for local Supabase. The phone and the desktop must be on that network. |
| Phone through the temporary tunnel | local Metro, not an EAS build | `EXPO_PUBLIC_API_URL` is the `https://*.trycloudflare.com` URL. Supabase is the staging project. Do not put Production values here. |
| Preview cloud build | preview | The same staging HTTPS pair. This build is not part of the no-cost path. |

`127.0.0.1` and `localhost` point at the phone itself, not the desktop. Do not use them for a device or a preview build. Do not invent a public URL. The account owner supplies the reachable address.

The development profile accepts a desktop loopback address, the Android emulator address `10.0.2.2`, or a private LAN address. It rejects Production and staging hosts. The preview profile accepts only a matching pair of staging HTTPS endpoints and rejects Production. The production profile accepts only the Production API host together with the Production Supabase host. Local `expo start` without an EAS profile still starts for desktop work.

## Preview APK

`eas.json` profile `preview` is internal distribution, selects the EAS `preview` environment, and builds an Android APK. It is not the store bundle. The production profile selects the EAS `production` environment and builds an Android App Bundle. Do not use it for preview testing.

The Expo project is linked to the team account already recorded in `app.json` and `app.config.ts`. Do not run `eas init` again.

Preview variables are still unset. They must come from the staging project once it exists:

1. Put staging values in `.env.staging` using `.env.staging.example`. Do not copy the Production root `.env`.
2. Store the same three public values in the EAS preview environment. Do not store a service-role key there.
3. Confirm before starting the build. `eas build --profile preview --platform android` can be a paid cloud build.
4. Do not commit a keystore or any credential file.

There is no verified APK until that build finishes and the artifact is checked. Staging itself is not created yet.

## Icons

The ValueOR mark in the web app is 148×117 pixels. The wordmark raster is 663×166. The vector file is a text wordmark, not the mark. The mobile icons are those existing assets padded to a square. They are valid for Expo schema checks and are not 1024×1024 store artwork. Do not upscale them and treat the result as production artwork. Store artwork needs an original high-resolution mark from the brand owner.

## Device checks after install

Install the preview APK, then check login, session restore, workspace selection, Dashboard, CRM, Inbox, Email, Tickets, Notifications, AI, Profile, logout, Arabic RTL, English and German LTR, back navigation, an expired session, attachment capture and upload, signed download, and `valueor://` links. Push delivery stays unverified until a physical device and Expo credentials are approved for one test-account notification.
