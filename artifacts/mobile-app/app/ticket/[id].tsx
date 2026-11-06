import { useLocalSearchParams } from "expo-router";
import { TicketDetailScreen } from "../../src/screens/detail-screen";

export default function TicketRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  return <TicketDetailScreen id={String(params.id ?? "")} />;
}
