import { useLocalSearchParams } from "expo-router";
import { CustomerDetailScreen } from "../../src/screens/detail-screen";

export default function CustomerRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  return <CustomerDetailScreen id={String(params.id ?? "")} />;
}
