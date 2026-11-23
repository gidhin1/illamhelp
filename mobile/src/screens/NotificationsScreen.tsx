import type { JSX } from "react";
import { alertCategory, alertDestination, type AlertDestination } from "@illamhelp/shared-types";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { formatDate, listNotifications, markAllNotificationsRead, markNotificationRead, type NotificationRecord } from "../api";
import { AppButton, Banner, StatusLabel } from "../components";
import { useAppStyles } from "../theme-context";
import { asError, shouldForceSignOut } from "../utils";

export function NotificationsScreen({
  accessToken,
  onSessionInvalid,
  onUnreadCountChange,
  onOpen
}: {
  accessToken: string;
  onSessionInvalid: () => void;
  onUnreadCountChange: (count: number) => void;
  onOpen: (route: AlertDestination["route"]) => void;
}): JSX.Element {
  const styles = useAppStyles();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const busy = loading || !!updating;

  const reportError = useCallback((requestError: unknown, fallback: string): void => {
    const message = asError(requestError, fallback);
    setError(message);
    if (shouldForceSignOut(message)) onSessionInvalid();
  }, [onSessionInvalid]);

  const updateCount = useCallback((count: number): void => {
    setUnreadCount(count);
    onUnreadCountChange(count);
  }, [onUnreadCountChange]);

  const load = useCallback(async (cursor?: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await listNotifications({ unreadOnly: showUnreadOnly, limit: 50, cursor }, accessToken);
      setNotifications((previous) => cursor ? [...previous, ...response.items] : response.items);
      setNextCursor(response.nextCursor);
      updateCount(response.unreadCount);
    } catch (requestError) {
      reportError(requestError, "Couldn’t load alerts. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, reportError, showUnreadOnly, updateCount]);

  useEffect(() => { void load(); }, [load]);

  const chooseFilter = (unread: boolean): void => {
    if (busy || unread === showUnreadOnly) return;
    setLoading(true);
    setShowUnreadOnly(unread);
    setNotifications([]);
    setNextCursor(null);
  };

  const markRead = async (notification: NotificationRecord): Promise<void> => {
    if (busy || notification.read) return;
    setUpdating(notification.id);
    setError(null);
    try {
      const updated = await markNotificationRead(notification.id, accessToken);
      setNotifications((previous) => showUnreadOnly
        ? previous.filter((item) => item.id !== updated.id)
        : previous.map((item) => item.id === updated.id ? updated : item));
      updateCount(Math.max(0, (unreadCount ?? 0) - 1));
    } catch (requestError) {
      reportError(requestError, "Couldn’t mark this alert as read. Try again.");
    } finally {
      setUpdating(null);
    }
  };

  const markAllRead = async (): Promise<void> => {
    if (busy || !unreadCount) return;
    setUpdating("all");
    setError(null);
    try {
      const { updated } = await markAllNotificationsRead(accessToken);
      setNotifications((previous) => showUnreadOnly ? [] : previous.map((item) => ({ ...item, read: true })));
      updateCount(Math.max(0, unreadCount - updated));
      await load();
    } catch (requestError) {
      reportError(requestError, "Couldn’t mark all alerts as read. Try again.");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screenScroll} testID="notifications-scroll">
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle} accessibilityRole="header">Your alerts</Text>
        <Text style={styles.screenSubtitle}>Updates about jobs, connections, contact sharing, and verification.</Text>
      </View>
      <View style={styles.stackSmall}>
        <View style={styles.roleRow}>
          <AppButton label="All alerts" selected={!showUnreadOnly} variant={showUnreadOnly ? "secondary" : "primary"}
            disabled={busy} onPress={() => chooseFilter(false)} testID="notifications-filter-all" />
          <AppButton label="Unread only" selected={showUnreadOnly} variant={showUnreadOnly ? "primary" : "secondary"}
            disabled={busy} onPress={() => chooseFilter(true)} testID="notifications-filter-toggle" />
        </View>
        {unreadCount !== undefined ? <Text style={styles.dataMeta} accessibilityLiveRegion="polite" testID="notifications-unread-count">{unreadCount} unread</Text> : null}
        <View style={styles.roleRow}>
          {unreadCount ? (
            <AppButton label={updating === "all" ? "Marking alerts…" : "Mark all as read"} variant="ghost"
              disabled={busy} onPress={() => void markAllRead()} testID="notifications-mark-all" />
          ) : null}
          <AppButton label="Refresh alerts" onPress={() => void load()} variant="ghost" disabled={busy} testID="notifications-refresh" />
        </View>
      </View>
      {error ? <Banner tone="error" message={error} testID="notifications-error-banner" /> : null}
      {loading && !notifications.length ? <Text style={styles.cardBodyMuted}>Loading alerts…</Text> : null}
      {!loading && !error && !notifications.length ? (
        <View style={styles.alertRow} testID="notifications-empty">
          <Text style={styles.dataTitle}>{showUnreadOnly ? "No unread alerts" : "No alerts yet"}</Text>
          <Text style={styles.cardBodyMuted}>{showUnreadOnly ? "Choose All alerts to see earlier updates." : "New activity will appear here."}</Text>
        </View>
      ) : null}
      <View style={styles.stackSmall}>
        {notifications.map((item) => {
          const action = alertDestination(item.type, item.data);
          return (
            <View key={item.id} style={styles.alertRow} testID={`notifications-item-${item.id}`}>
              <View style={styles.roleRow}>
                <Text style={styles.dataMeta}>{alertCategory(item.type)} · {formatDate(item.createdAt)}</Text>
                {!item.read ? <StatusLabel label="Unread" /> : null}
              </View>
              <Text style={styles.dataTitle}>{item.title}</Text>
              <Text style={styles.cardBodyMuted}>{item.body}</Text>
              {action ? <AppButton label={action.label} variant="secondary" onPress={() => onOpen(action.route)} testID={`notifications-open-${item.id}`} /> : null}
              {!item.read ? (
                <AppButton label={updating === item.id ? "Marking alert…" : "Mark as read"} variant="ghost"
                  disabled={busy} onPress={() => void markRead(item)} testID={`notifications-mark-read-${item.id}`} />
              ) : null}
            </View>
          );
        })}
      </View>
      {nextCursor ? (
        <AppButton label={loading ? "Loading alerts…" : "Load more alerts"} onPress={() => void load(nextCursor)}
          variant="secondary" disabled={busy} testID="notifications-load-more" />
      ) : null}
    </ScrollView>
  );
}
