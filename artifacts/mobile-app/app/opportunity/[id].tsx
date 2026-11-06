import { useLocalSearchParams } from "expo-router";
import { OpportunityEditor } from "../../src/screens/record-editor";

export default function OpportunityRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  return <OpportunityEditor id={String(params.id ?? "")} />;
}
