import { Redirect } from "expo-router";
import { LoginScreen } from "../src/screens/login-screen";
import { useAppSession } from "../src/providers";

export default function LoginRoute() {
  const app = useAppSession();
  if (app.session) return <Redirect href="/(workspace)" />;
  return <LoginScreen />;
}
