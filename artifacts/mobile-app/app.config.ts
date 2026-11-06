import type { ConfigContext, ExpoConfig } from "expo/config";
import { assessMobileBuildTarget } from "./src/lib/preview-target.js";
import { recordedProductionSupabaseOrigin } from "../../scripts/lib/env-mode.mjs";

const CAMERA_TEXT = "ValueOR uses the camera when you attach a photo to a record.";
const PHOTO_TEXT = "ValueOR uses your photo library when you attach an image to a record.";

export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.EAS_BUILD_PROFILE ?? "local";
  const target = assessMobileBuildTarget({
    profile,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    recordedProductionHost: new URL(recordedProductionSupabaseOrigin()).hostname,
  });
  if (!target.ok) {
    throw new Error(`The ${profile} mobile build is not device-ready (${target.code}).`);
  }
  return {
  ...config,
  name: "ValueOR",
  slug: "valueor",
  owner: "omarabdelazizs-team",
  scheme: "valueor",
  version: "0.1.0",
  runtimeVersion: { policy: "appVersion" },
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    ...config.ios,
    bundleIdentifier: "org.valueor.mobile",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription: CAMERA_TEXT,
      NSPhotoLibraryUsageDescription: PHOTO_TEXT,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    ...config.android,
    package: "org.valueor.mobile",
    versionCode: 1,
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: "#041C1B",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-dev-client",
    "expo-router",
    "expo-secure-store",
    [
      "expo-image-picker",
      { photosPermission: PHOTO_TEXT, cameraPermission: CAMERA_TEXT, microphonePermission: false },
    ],
    [
      "expo-notifications",
      { icon: "./assets/icon.png", color: "#0D9488" },
    ],
    [
      "expo-build-properties",
      { android: { minSdkVersion: 24 }, ios: { deploymentTarget: "16.4" } },
    ],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    eas: {
      projectId: "1f249759-6e18-499f-a046-e652a8524cfd",
    },
  },
  };
};
