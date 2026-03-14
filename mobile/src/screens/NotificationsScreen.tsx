
import {
  formatDate, listNotifications, markAllNotificationsRead, markNotificationRead, NotificationRecord
} from "../api";

import {
  shouldForceSignOut, asError
} from "../utils";

import {
  NOTIFICATION_TYPE_LABELS
} from "../constants";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {} from "../theme";
import { styles } from "../styles";
import { AppButton, Banner, SectionCard } from "../components";

export function NotificationsScreen({
  accessToken,
  onSessionInvalid,
  onUnreadCountChange
}: {
  accessToken: string;
  onSessionInvalid: () => void;
  onUnreadCountChange: (count: number) => void;
}): JSX.Element {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const updateUnreadCount = useCallback(
    (count: number): void => {
      setUnreadCount(count);
      onUnreadCountChange(count);
    },
    [onUnreadCountChange]
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await listNotifications(
        { unreadOnly: showUnreadOnly, limit: 50, offset: 0 },
        accessToken
      );
      setNotifications(response.items);
      setTotal(response.total);
      updateUnreadCount(response.unreadCount);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load alerts");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid, showUnreadOnly, updateUnreadCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const onMarkRead = async (notificationId: string): Promise<void> => {
    setActionLoadingId(`read-${notificationId}`);
    setError(null);
    try {
      const updated = await markNotificationRead(notificationId, accessToken);
      setNotifications((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      const nextUnread = Math.max(0, unreadCount - 1);
      updateUnreadCount(nextUnread);
    } catch (requestError) {
      const message = asError(requestError, "Unable to mark alert as read");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const onMarkAllRead = async (): Promise<void> => {
    setActionLoadingId("read-all");
    setError(null);
    try {
      await markAllNotificationsRead(accessToken);
      setNotifications((previous) =>
        previous.map((item) => ({
          ...item,
          read: true,
          readAt: item.readAt ?? new Date().toISOString()
        }))
      );
      updateUnreadCount(0);
    } catch (requestError) {
      const message = asError(requestError, "Unable to mark all alerts as read");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const renderNotificationContext = (item: NotificationRecord): string | null => {
    const pairs: { key: string; label: string }[] = [
      { key: "jobId", label: "Job" },
      { key: "connectionId", label: "Connection" },
      { key: "applicationId", label: "Application" },
      { key: "grantId", label: "Grant" },
      { key: "requestId", label: "Request" },
      { key: "mediaId", label: "Media" }
    ];
    const values = pairs
      .map((pair) => {
        const rawValue = item.data[pair.key];
        if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
          return null;
        }
        return `${pair.label}: ${rawValue}`;
      })
      .filter((value): value is string => Boolean(value));
    return values.length > 0 ? values.join(" · ") : null;
  };

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="notifications-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Alerts</Text>
        <Text style={styles.screenTitle}>Stay updated</Text>
        <Text style={styles.screenSubtitle}>
          Job updates, people requests, privacy changes, and verification updates.
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} testID="notifications-error-banner" /> : null}

      <SectionCard title="Inbox">
        <View style={styles.roleRow}>
          <View style={styles.roleChip} testID="notifications-unread-count">
            <Text style={styles.roleChipLabel}>{unreadCount} unread</Text>
          </View>
          <AppButton
            label={showUnreadOnly ? "Show all" : "Show unread only"}
            onPress={() => setShowUnreadOnly((previous) => !previous)}
            variant="ghost"
            testID="notifications-filter-toggle"
          />
          {unreadCount > 0 ? (
            <AppButton
              label={actionLoadingId === "read-all" ? "Updating..." : "Mark all read"}
              onPress={() => {
                void onMarkAllRead();
              }}
              variant="secondary"
              disabled={actionLoadingId === "read-all"}
              testID="notifications-mark-all"
            />
          ) : null}
        </View>

        {loading ? <Text style={styles.cardBodyMuted}>Loading alerts...</Text> : null}
        {!loading && notifications.length === 0 ? (
          <Text style={styles.cardBodyMuted} testID="notifications-empty">
            No alerts yet.
          </Text>
        ) : null}
        {!loading && notifications.length > 0 ? (
          <View style={styles.stackSmall}>
            {notifications.map((item) => {
              const context = renderNotificationContext(item);
              return (
                <View
                  key={item.id}
                  style={[
                    styles.dataRow,
                    !item.read ? styles.notificationRowUnread : null
                  ]}
                  testID={`notifications-item-${item.id}`}
                >
                  <View style={styles.notificationMetaRow}>
                    <Text style={styles.dataTitle}>
                      {NOTIFICATION_TYPE_LABELS[item.type] ?? item.type}
                    </Text>
                    <Text style={styles.dataMeta}>{formatDate(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.dataTitle}>{item.title}</Text>
                  <Text style={styles.dataMeta}>{item.body}</Text>
                  {context ? <Text style={styles.dataMeta}>{context}</Text> : null}
                  {!item.read ? (
                    <AppButton
                      label={
                        actionLoadingId === `read-${item.id}` ? "Updating..." : "Mark read"
                      }
                      onPress={() => {
                        void onMarkRead(item.id);
                      }}
                      variant="ghost"
                      disabled={actionLoadingId === `read-${item.id}`}
                      testID={`notifications-mark-read-${item.id}`}
                    />
                  ) : (
                    <Text style={styles.cardBodyMuted}>Read {formatDate(item.readAt)}</Text>
                  )}
                </View>
              );
            })}
            {total > notifications.length ? (
              <Text style={styles.cardBodyMuted}>
                Showing {notifications.length} of {total} alerts.
              </Text>
            ) : null}
          </View>
        ) : null}
      </SectionCard>

      <AppButton
        label={loading ? "Refreshing..." : "Refresh alerts"}
        onPress={() => {
          void load();
        }}
        variant="ghost"
        disabled={loading}
        testID="notifications-refresh"
      />
    </ScrollView>
  );
}
