import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { brand } from "../theme/palette";

const logo = require("../../assets/brand/logo-valueor-mark.png");

export function BootScreen({ label }: { label: string }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <View style={styles.center}>
        <Image source={logo} style={styles.mark} resizeMode="contain" accessibilityLabel="ValueOR" />
        <ActivityIndicator color={brand.primary} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  mark: { width: 84, height: 68 },
  label: { color: "#D7F5F1", fontSize: 15 },
});
