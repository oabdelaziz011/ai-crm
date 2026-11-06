import { useRef, useState } from "react";
import { Image } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { Button, Card, Muted, Title } from "../components/ui";
import { decideAttachment, uploadStorageObject, type UploadHandle } from "../data/attachments";
import { readMobileConfig } from "../lib/config";
import { useAppSession } from "../providers";

type ListedAttachment = { name: string; path: string; size: number | null; mime: string | null };

async function mobileFetch(input: {
  apiUrl: string;
  token: string;
  host: string;
  path: string;
  method?: string;
  body?: unknown;
}) {
  const response = await fetch(`${input.apiUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
      "X-ValueOR-Instance": input.host,
      Accept: "application/json",
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json: json as Record<string, unknown> };
}

export function AttachmentSection({ conversationId }: { conversationId: string }) {
  const app = useAppSession();
  const client = useQueryClient();
  const uploadRef = useRef<UploadHandle | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["attachments", app.session?.company?.id, conversationId],
    enabled: Boolean(app.session && app.apiUrl && app.instanceHostname),
    queryFn: async () => {
      const token = await app.accessToken();
      if (!token || !app.apiUrl || !app.instanceHostname) return [];
      const result = await mobileFetch({
        apiUrl: app.apiUrl,
        token,
        host: app.instanceHostname,
        path: `/api/mobile/attachments?conversationId=${encodeURIComponent(conversationId)}`,
      });
      if (result.status === 401) throw new Error("session_expired");
      if (result.status === 403) throw new Error("forbidden");
      if (!result.json.ok) throw new Error("load_failed");
      return Array.isArray(result.json.attachments) ? result.json.attachments as ListedAttachment[] : [];
    },
  });

  async function uploadAsset(uri: string, fileName: string, mime: string) {
    if (app.offline) {
      setNotice(app.t("networkError"));
      return;
    }
    const token = await app.accessToken();
    const extra = Constants.expoConfig?.extra as { apiUrl?: string; supabaseUrl?: string; supabasePublishableKey?: string } | undefined;
    const config = readMobileConfig(extra);
    if (!token || !app.apiUrl || !app.instanceHostname || !config.ok) {
      setNotice(app.t("sessionExpired"));
      return;
    }
    const file = await fetch(uri);
    const blob = await file.blob();
    const decision = decideAttachment({ bytes: blob.size, mime, fileName });
    if (!decision.ok) {
      setNotice(app.t("attachmentRejected"));
      return;
    }
    const prepared = await mobileFetch({
      apiUrl: app.apiUrl,
      token,
      host: app.instanceHostname,
      path: "/api/mobile/attachments/prepare",
      method: "POST",
      body: { conversationId, fileName, mime: decision.mime, bytes: blob.size },
    });
    if (prepared.status === 401) {
      setNotice(app.t("sessionExpired"));
      return;
    }
    if (!prepared.json.ok || typeof prepared.json.path !== "string" || typeof prepared.json.bucket !== "string") {
      setNotice(prepared.status === 403 ? app.t("noPermission") : app.t("uploadFailed"));
      return;
    }
    setProgress(0);
    const handle = uploadStorageObject({
      supabaseUrl: config.config.supabaseUrl,
      publishableKey: config.config.supabasePublishableKey,
      accessToken: token,
      bucket: prepared.json.bucket,
      path: prepared.json.path,
      mime: decision.mime,
      body: blob,
      onProgress: setProgress,
    });
    uploadRef.current = handle;
    try {
      await handle.promise;
      setNotice(app.t("uploadComplete"));
      await client.invalidateQueries({ queryKey: ["attachments", app.session?.company?.id, conversationId] });
    } catch (error) {
      setNotice(error instanceof Error && error.message === "cancelled" ? app.t("uploadCancelled") : app.t("uploadFailed"));
    } finally {
      uploadRef.current = null;
      setProgress(null);
    }
  }

  async function pickImage(source: "camera" | "library") {
    const permission = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice(app.t(source === "camera" ? "cameraDenied" : "libraryDenied"));
      return;
    }
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await uploadAsset(asset.uri, asset.fileName ?? "photo.jpg", asset.mimeType ?? "image/jpeg");
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await uploadAsset(asset.uri, asset.name, asset.mimeType ?? "application/octet-stream");
  }

  async function download(path: string, mime: string | null) {
    const token = await app.accessToken();
    if (!token || !app.apiUrl || !app.instanceHostname) {
      setNotice(app.t("sessionExpired"));
      return;
    }
    const result = await mobileFetch({
      apiUrl: app.apiUrl,
      token,
      host: app.instanceHostname,
      path: "/api/mobile/attachments/download",
      method: "POST",
      body: { conversationId, path },
    });
    if (result.status === 401) {
      setNotice(app.t("sessionExpired"));
      return;
    }
    if (typeof result.json.url !== "string") {
      setNotice(app.t("downloadFailed"));
      return;
    }
    if (mime?.startsWith("image/")) setPreview(result.json.url);
    else setNotice(app.t("preview"));
  }

  async function remove(path: string) {
    const token = await app.accessToken();
    if (!token || !app.apiUrl || !app.instanceHostname) return;
    const result = await mobileFetch({
      apiUrl: app.apiUrl,
      token,
      host: app.instanceHostname,
      path: "/api/mobile/attachments/delete",
      method: "POST",
      body: { conversationId, path },
    });
    setNotice(result.json.ok ? app.t("saved") : app.t("noPermission"));
    if (result.json.ok) await client.invalidateQueries({ queryKey: ["attachments", app.session?.company?.id, conversationId] });
  }

  return (
    <Card palette={app.palette}>
      <Title palette={app.palette}>{app.t("attachments")}</Title>
      {query.isLoading ? <Muted palette={app.palette}>{app.t("loading")}</Muted> : null}
      {query.isError ? (
        <>
          <Muted palette={app.palette}>{query.error instanceof Error && query.error.message === "forbidden" ? app.t("noPermission") : query.error instanceof Error && query.error.message === "session_expired" ? app.t("sessionExpired") : app.t("error")}</Muted>
          <Button palette={app.palette} tone="secondary" label={app.t("retry")} onPress={() => void query.refetch()} />
        </>
      ) : null}
      {!query.isLoading && !query.isError && (query.data ?? []).length === 0 ? <Muted palette={app.palette}>{app.t("empty")}</Muted> : null}
      {(query.data ?? []).map((file) => (
        <Card key={file.path} palette={app.palette}>
          <Muted palette={app.palette}>{file.name}</Muted>
          <Button palette={app.palette} tone="secondary" label={app.t("preview")} onPress={() => void download(file.path, file.mime)} />
          <Button palette={app.palette} tone="danger" label={app.t("removeAttachment")} onPress={() => void remove(file.path)} />
        </Card>
      ))}
      {preview ? <Image accessibilityLabel={app.t("preview")} source={{ uri: preview }} style={{ width: "100%", height: 180, borderRadius: 8 }} /> : null}
      {progress != null ? <Muted palette={app.palette}>{app.t("uploadProgress")} {Math.round(progress * 100)}%</Muted> : null}
      {progress != null ? <Button palette={app.palette} tone="secondary" label={app.t("cancel")} onPress={() => uploadRef.current?.cancel()} /> : null}
      <Button palette={app.palette} tone="secondary" label={app.t("attachPhoto")} onPress={() => void pickImage("camera")} />
      <Button palette={app.palette} tone="secondary" label={app.t("library")} onPress={() => void pickImage("library")} />
      <Button palette={app.palette} tone="secondary" label={app.t("attachFile")} onPress={() => void pickDocument()} />
      {notice ? <Muted palette={app.palette}>{notice}</Muted> : null}
    </Card>
  );
}
