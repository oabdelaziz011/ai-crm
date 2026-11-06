import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { validateLoginDraft } from "../auth/sign-in";
import { useAppSession } from "../providers";
import { brand } from "../theme/palette";
import type { AppLanguage } from "../i18n/catalog";

const lockup = require("../../assets/brand/logo-valueor-clear.png");

const LANGUAGES: Array<{ id: AppLanguage; label: "languageEnglish" | "languageArabic" | "languageGerman" }> = [
  { id: "en", label: "languageEnglish" },
  { id: "ar", label: "languageArabic" },
  { id: "de", label: "languageGerman" },
];

export function LoginScreen() {
  const app = useAppSession();
  const window = useWindowDimensions();
  const compact = window.height < 700;
  const [instanceUrl, setInstanceUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const align = app.direction === "rtl" ? "right" : "left";
  const blocked = Boolean(app.configError);

  async function submit() {
    const draft = validateLoginDraft({ instanceUrl, email, password });
    if (draft) {
      setMessage(app.t(draft === "invalid_instance" ? "invalidInstance" : draft === "invalid_email" ? "invalidEmail" : "emptyCredentials"));
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await app.signIn({ instanceUrl, email, password, remember });
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  async function recover() {
    const draft = validateLoginDraft({ instanceUrl, email, password: "placeholder" });
    if (draft === "invalid_instance" || draft === "invalid_email" || !email.trim()) {
      setMessage(app.t(draft === "invalid_instance" ? "invalidInstance" : draft === "empty_credentials" || !email.trim() ? "emptyCredentials" : "invalidEmail"));
      return;
    }
    setBusy(true);
    const result = await app.recover({ instanceUrl, email });
    setBusy(false);
    setMessage(result.ok ? app.t("recoverySent") : result.message);
  }

  return (
    <View style={styles.canvas}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            style={styles.safe}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={[styles.scroll, { paddingBottom: compact ? 16 : 20 }]}
          >
            <View style={styles.languages} accessibilityRole="tablist">
              {LANGUAGES.map((language) => {
                const selected = app.language === language.id;
                return (
                  <Pressable
                    key={language.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={app.t(language.label)}
                    onPress={() => app.setLanguage(language.id)}
                    style={[styles.language, selected ? styles.languageSelected : null]}
                  >
                    <Text style={[styles.languageText, selected ? styles.languageTextSelected : null]} numberOfLines={1}>
                      {app.t(language.label)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.statement}>{app.t("brandStatement")}</Text>

            <View style={[styles.card, { direction: app.direction, paddingVertical: compact ? 18 : 28 }]}>
              <View style={styles.intro}>
                <Image source={lockup} style={[styles.lockup, { height: compact ? 56 : 76 }]} resizeMode="contain" accessibilityLabel={app.t("appName")} />
                <Text style={[styles.welcome, compact ? styles.welcomeCompact : null, { textAlign: "center" }]}>{app.t("welcomeTitle")}</Text>
                <Text style={[styles.welcomeBody, { textAlign: "center" }]}>{app.t("welcomeBody")}</Text>
              </View>

              {app.bootError ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={[styles.errorText, { textAlign: align }]}>{app.t("startupFailed")}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={app.t("retry")} onPress={app.retryBoot} style={styles.retry}>
                    <Text style={styles.retryText}>{app.t("retry")}</Text>
                  </Pressable>
                </View>
              ) : null}

              {app.configError ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={[styles.errorText, { textAlign: align }]}>
                    {app.t(app.configError === "privileged_key" ? "privilegedKey" : "missingConfig")}
                  </Text>
                </View>
              ) : null}

              <View style={styles.form}>
              <Text style={[styles.label, { textAlign: align }]}>{app.t("instanceUrl")}</Text>
              <View style={styles.field}>
                <View pointerEvents="none" style={styles.leadingIcon} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <GlobeIcon />
                </View>
                <TextInput
                  accessibilityLabel={app.t("instanceUrl")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  inputMode="url"
                  placeholder={app.t("instancePlaceholder")}
                  placeholderTextColor="#94A3B8"
                  value={instanceUrl}
                  onChangeText={setInstanceUrl}
                  textAlign={align}
                  style={[styles.input, styles.inputWithLeading, { textAlign: align }]}
                />
              </View>

              <Text style={[styles.label, { textAlign: align }]}>{app.t("email")}</Text>
              <TextInput
                accessibilityLabel={app.t("email")}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                placeholder={app.t("emailPlaceholder")}
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                textAlign={align}
                style={[styles.input, { textAlign: align }]}
              />

              <Text style={[styles.label, { textAlign: align }]}>{app.t("password")}</Text>
              <View style={styles.field}>
                <TextInput
                  accessibilityLabel={app.t("password")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  textAlign={align}
                  onSubmitEditing={() => void submit()}
                  style={[styles.input, styles.inputWithTrailing, { textAlign: align }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? app.t("hidePassword") : app.t("showPassword")}
                  onPress={() => setShowPassword((value) => !value)}
                  hitSlop={4}
                  style={styles.trailingButton}
                >
                  <EyeIcon revealed={showPassword} />
                </Pressable>
              </View>

              <View style={styles.rememberRow}>
                <Text style={[styles.remember, { textAlign: align }]}>{app.t("remember")}</Text>
                <Switch
                  accessibilityLabel={app.t("remember")}
                  value={remember}
                  onValueChange={setRemember}
                  trackColor={{ false: "#CBD5E1", true: brand.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {message ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={[styles.errorText, { textAlign: align }]}>{message}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={busy ? app.t("signingIn") : app.t("signIn")}
                accessibilityState={{ disabled: busy || blocked, busy }}
                disabled={busy || blocked}
                onPress={() => void submit()}
                style={({ pressed }) => [styles.signIn, (busy || blocked) && styles.disabled, pressed && !busy ? styles.pressed : null]}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.signInText}>{app.t("signIn")}</Text>}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={app.t("forgotPassword")}
                disabled={busy || blocked}
                onPress={() => void recover()}
                style={styles.forgot}
              >
                <Text style={styles.forgotText}>{app.t("forgotPassword")}</Text>
              </Pressable>
              </View>

              <View style={styles.security}>
                <Text style={[styles.securityTitle, { textAlign: align }]}>{app.t("securityTitle")}</Text>
                <Text style={[styles.securityBody, { textAlign: align }]}>{app.t("securityBody")}</Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: brand.canvas },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  languages: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
    maxWidth: "100%",
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  language: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  languageSelected: { backgroundColor: brand.primary },
  languageText: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: "600" },
  languageTextSelected: { color: "#FFFFFF" },
  statement: { color: "#D7F5F1", textAlign: "center", fontSize: 15, fontWeight: "500" },
  card: {
    flexGrow: 1,
    backgroundColor: brand.card,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 28,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  intro: { gap: 4 },
  lockup: { width: "100%", height: 76, marginBottom: 4 },
  welcome: { color: "#0F172A", fontSize: 28, fontWeight: "800", letterSpacing: -0.4 },
  welcomeCompact: { fontSize: 24 },
  welcomeBody: { color: "#64748B", fontSize: 15, marginBottom: 4 },
  form: { gap: 8 },
  label: { color: "#475569", fontSize: 14, fontWeight: "600", marginTop: 6 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#0F172A",
  },
  field: { justifyContent: "center" },
  leadingIcon: { position: "absolute", start: 14, zIndex: 1 },
  trailingButton: { position: "absolute", end: 4, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  inputWithLeading: { paddingStart: 42 },
  inputWithTrailing: { paddingEnd: 48 },
  rememberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, marginTop: 4 },
  remember: { color: "#475569", fontSize: 15, flex: 1 },
  errorBox: { borderRadius: 12, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", paddingVertical: 8, paddingHorizontal: 12 },
  errorText: { color: "#B91C1C", fontSize: 14, lineHeight: 20 },
  signIn: { minHeight: 54, borderRadius: 12, backgroundColor: brand.primary, alignItems: "center", justifyContent: "center", marginTop: 8 },
  signInText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  pressed: { backgroundColor: brand.primaryPressed },
  disabled: { opacity: 0.55 },
  forgot: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  forgotText: { color: brand.primary, fontSize: 15, fontWeight: "600" },
  retry: { minHeight: 36, marginTop: 4, alignItems: "center", justifyContent: "center" },
  retryText: { color: brand.primary, fontSize: 15, fontWeight: "700" },
  security: { marginTop: "auto", borderRadius: 12, backgroundColor: "#EEF6F8", padding: 14, gap: 4 },
  securityTitle: { color: "#1E293B", fontSize: 14, fontWeight: "700" },
  securityBody: { color: "#64748B", fontSize: 12, lineHeight: 18 },
});

function GlobeIcon() {
  return (
    <View style={iconStyles.globe}>
      <View style={iconStyles.globeMeridian} />
      <View style={iconStyles.globeParallel} />
    </View>
  );
}

function EyeIcon({ revealed }: { revealed: boolean }) {
  return (
    <View style={iconStyles.eyeWrap}>
      <View style={iconStyles.eye}>{revealed ? <View style={iconStyles.pupil} /> : null}</View>
      {revealed ? null : <View style={iconStyles.slash} />}
    </View>
  );
}

const iconStyles = StyleSheet.create({
  globe: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#64748B",
    alignItems: "center",
    justifyContent: "center",
  },
  globeMeridian: {
    position: "absolute",
    width: 8,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#64748B",
  },
  globeParallel: { position: "absolute", width: 16, height: 1.5, backgroundColor: "#64748B" },
  eyeWrap: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  eye: {
    width: 22,
    height: 14,
    borderRadius: 11,
    borderWidth: 1.6,
    borderColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pupil: { width: 6, height: 6, borderRadius: 3, backgroundColor: brand.primary },
  slash: { position: "absolute", width: 22, height: 1.6, backgroundColor: brand.primary, transform: [{ rotate: "-32deg" }] },
});
