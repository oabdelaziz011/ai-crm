import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button, Card, Field, Loading, Muted, Screen, StateMessage, Title } from "../components/ui";
import { canAccess } from "../auth/session-policy";
import { searchPattern } from "../lib/instance-url";
import { queryErrorText } from "../i18n/present";
import { useAppSession } from "../providers";

export type ListRow = { id: string; title: string; subtitle: string };

export function PermissionListScreen({
  title,
  permission,
  table,
  columns,
  searchColumn,
  equals,
  channels,
  showUnread,
  href,
  map,
}: {
  title: string;
  permission: string;
  table: string;
  columns: string;
  searchColumn?: string;
  equals?: Record<string, string>;
  channels?: { id: string; label: string; column: string }[];
  showUnread?: boolean;
  href: (id: string) => string;
  map: (row: Record<string, unknown>) => ListRow;
}) {
  const app = useAppSession();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const companyId = app.session?.company?.id;
  const allowed = canAccess(app.session, permission);
  const query = useQuery({
    queryKey: [table, companyId, search, equals, channel, limit, unreadOnly],
    enabled: Boolean(app.supabase && companyId && allowed),
    queryFn: async () => {
      let request = app.supabase!.from(table).select(columns).eq("company_id", companyId!);
      for (const [column, value] of Object.entries(equals ?? {})) request = request.eq(column, value);
      const selectedChannel = channels?.find((item) => item.id === channel);
      if (selectedChannel) request = request.eq(selectedChannel.column, selectedChannel.id);
      if (unreadOnly) request = request.gt("unread_count_employee", 0);
      const pattern = searchColumn ? searchPattern(search) : null;
      if (pattern && searchColumn) request = request.ilike(searchColumn, pattern);
      const { data, error } = await request.order("created_at", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(map);
    },
  });

  if (!allowed) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{title}</Title>
      {channels?.map((item) => (
        <Button key={item.id} palette={app.palette} tone={channel === item.id ? "primary" : "secondary"} label={item.label} onPress={() => setChannel((current) => current === item.id ? null : item.id)} />
      ))}
      {searchColumn ? <Field palette={app.palette} label={app.t("search")} value={search} onChangeText={setSearch} /> : null}
      {showUnread ? <Button palette={app.palette} tone={unreadOnly ? "primary" : "secondary"} label={app.t("unreadOnly")} onPress={() => setUnreadOnly((current) => !current)} /> : null}
      {query.isLoading ? <Loading palette={app.palette} label={app.t("loading")} /> : null}
      {query.error ? <StateMessage palette={app.palette} title={app.t("error")} body={queryErrorText(app.language, query.error)} actionLabel={app.t("retry")} onAction={() => void query.refetch()} /> : null}
      {query.data && query.data.length === 0 ? <Muted palette={app.palette}>{app.t("empty")}</Muted> : null}
      <FlatList
        style={{ flex: 1 }}
        data={query.data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={app.palette.primary} />}
        onEndReached={() => setLimit((current) => current + 20)}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push(href(item.id) as never)} style={{ minHeight: 48, marginBottom: 8 }}>
            <Card palette={app.palette}>
              <Text style={{ color: app.palette.text, fontSize: 16, fontWeight: "700", textAlign: app.direction === "rtl" ? "right" : "left" }}>{item.title}</Text>
              <Muted palette={app.palette}>{item.subtitle}</Muted>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
