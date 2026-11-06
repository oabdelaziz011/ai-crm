import { Redirect } from "expo-router";
import { BootScreen } from "../src/components/boot-screen";
import { useAppSession } from "../src/providers";

export default function Index() {
  const app = useAppSession();
  if (app.booting) return <BootScreen label={app.t("loading")} />;
  if (!app.session) return <Redirect href="/login" />;
  return <Redirect href="/(workspace)" />;
}
