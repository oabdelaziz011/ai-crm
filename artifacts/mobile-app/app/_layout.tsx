import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DeepLinkHost } from "../src/navigation/deep-link-host";
import { AppProviders, useAppSession } from "../src/providers";

function Routes() {
  const app = useAppSession();
  return (
    <>
      <StatusBar style="auto" />
      <DeepLinkHost />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: app.palette.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(workspace)" />
        <Stack.Screen name="customer/[id]" />
        <Stack.Screen name="conversation/[id]" />
        <Stack.Screen name="ticket/[id]" />
        <Stack.Screen name="lead/[id]" />
        <Stack.Screen name="opportunity/[id]" />
        <Stack.Screen name="email" />
        <Stack.Screen name="company" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="ai" />
        <Stack.Screen name="profile" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <Routes />
      </AppProviders>
    </SafeAreaProvider>
  );
}
