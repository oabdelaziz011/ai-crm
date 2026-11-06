import { useLocalSearchParams } from "expo-router";
import { ConversationDetailScreen } from "../../src/screens/detail-screen";

export default function ConversationRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  return <ConversationDetailScreen id={String(params.id ?? "")} />;
}
