import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { useAppSession } from "../providers";
import type { Palette } from "../theme/palette";

export function Screen({ palette, children, style }: { palette: Palette; children: ReactNode; style?: ViewStyle }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={["top", "right", "bottom", "left"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={[styles.screen, { backgroundColor: palette.background }, style]}>{children}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ palette, children }: { palette: Palette; children: ReactNode }) {
  const align = useAppSession().direction === "rtl" ? "right" : "left";
  return <Text style={[styles.title, { color: palette.text, textAlign: align }]}>{children}</Text>;
}

export function Muted({ palette, children }: { palette: Palette; children: ReactNode }) {
  const align = useAppSession().direction === "rtl" ? "right" : "left";
  return <Text style={[styles.muted, { color: palette.muted, textAlign: align }]}>{children}</Text>;
}

export function Card({ palette, children }: { palette: Palette; children: ReactNode }) {
  return <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>{children}</View>;
}

export function Field({
  palette,
  label,
  ...input
}: { palette: Palette; label: string } & TextInputProps) {
  const align = useAppSession().direction === "rtl" ? "right" : "left";
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.muted, textAlign: align }]}>{label}</Text>
      <TextInput
        placeholderTextColor={palette.muted}
        {...input}
        textAlign={align}
        style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card, textAlign: align, writingDirection: align === "right" ? "rtl" : "ltr" }, input.style]}
      />
    </View>
  );
}

export function Button({
  palette,
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  palette: Palette;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}) {
  const background = tone === "primary" ? palette.primary : tone === "danger" ? palette.danger : palette.card;
  const color = tone === "secondary" ? palette.text : palette.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: palette.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Loading({ palette, label }: { palette: Palette; label: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={palette.primary} />
      <Muted palette={palette}>{label}</Muted>
    </View>
  );
}

export function StateMessage({ palette, title, body, actionLabel, onAction }: {
  palette: Palette;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Title palette={palette}>{title}</Title>
      {body ? <Muted palette={palette}>{body}</Muted> : null}
      {actionLabel && onAction ? <Button palette={palette} label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  muted: { fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  button: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderWidth: 1 },
  buttonText: { fontSize: 16, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
});
