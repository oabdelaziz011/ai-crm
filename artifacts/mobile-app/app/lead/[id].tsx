import { useLocalSearchParams } from "expo-router";
import { LeadEditor } from "../../src/screens/record-editor";

export default function LeadRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  return <LeadEditor id={String(params.id ?? "")} />;
}
