"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
    Banner,
    Button,
    EmptyState
} from "@/components/ui/primitives";
import {
    formatDate,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    NotificationRecord
} from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
    job_application_received: "📋 Application",
    job_application_accepted: "✅ Accepted",
    job_application_rejected: "❌ Rejected",
    job_booking_started: "🔨 Booking",
    job_booking_completed: "🎉 Completed",
    job_booking_cancelled: "🚫 Cancelled",
    connection_request_received: "🤝 Connection",
    connection_request_accepted: "✅ Connected",
    connection_request_declined: "❌ Declined",
    verification_approved: "✅ Verified",
    verification_rejected: "❌ Verification",
    consent_grant_received: "🔐 Consent",
    consent_grant_revoked: "🔓 Revoked",
    media_approved: "📸 Media",
    media_rejected: "🚫 Media",
    system_announcement: "📢 System"
};

export default function NotificationsPage(): JSX.Element {
    const { accessToken } = useSession();
    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);

    const loadNotifications = useCallback(async (): Promise<void> => {
        if (!accessToken) return;
        setLoading(true);
        setError(null);
        try {
            const result = await listNotifications(
                { unreadOnly: showUnreadOnly, limit: 50 },
                accessToken
            );
            setNotifications(result.items);
            setUnreadCount(result.unreadCount);
            setTotal(result.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load notifications");
        } finally {
            setLoading(false);
        }
    }, [accessToken, showUnreadOnly]);

    useEffect(() => {
        void loadNotifications();
    }, [loadNotifications]);

    const onMarkRead = async (id: string): Promise<void> => {
        if (!accessToken) return;
        try {
            const updated = await markNotificationRead(id, accessToken);
            setNotifications((prev) => {
                if (showUnreadOnly) {
                    return prev.filter((n) => n.id !== updated.id);
                }
                return prev.map((n) => (n.id === updated.id ? updated : n));
            });
            setUnreadCount((prev) => Math.max(0, prev - 1));
            if (showUnreadOnly) {
                setTotal((prev) => Math.max(0, prev - 1));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to mark as read");
        }
    };

    const onMarkAllRead = async (): Promise<void> => {
        if (!accessToken) return;
        try {
            await markAllNotificationsRead(accessToken);
            setNotifications((prev) =>
                showUnreadOnly
                    ? []
                    : prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
            );
            setUnreadCount(0);
            if (showUnreadOnly) {
                setTotal(0);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to mark all as read");
        }
    };

    return (
        <PageShell>
            <div className="section-header" style={{ position: "sticky", top: 0, background: "color-mix(in srgb, var(--bg) 85%, transparent)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "var(--spacing-sm)" }}>
                    <h2 style={{ fontSize: "1.25rem" }}>Notifications</h2>
                    <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "center", flexWrap: "wrap" }}>
                        <span className="pill">{unreadCount} unread</span>
                        <Button variant="ghost" onClick={() => setShowUnreadOnly((prev) => !prev)}>
                            {showUnreadOnly ? "Show all" : "Unread only"}
                        </Button>
                        {unreadCount > 0 && (
                            <Button variant="secondary" onClick={() => void onMarkAllRead()}>
                                Mark all read
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <RequireSession>
                <div className="stack" style={{ gap: 0 }}>
                    {error && (
                        <div style={{ padding: "var(--spacing-md)" }}>
                            <Banner tone="error">{error}</Banner>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ padding: "var(--spacing-xl)", textAlign: "center" }} aria-live="polite">Loading notifications...</div>
                    ) : notifications.length === 0 ? (
                        <div style={{ padding: "var(--spacing-xl)" }}>
                            <EmptyState
                                title="No notifications yet"
                                body="You'll receive notifications when someone applies to your jobs, sends a connection request, or your verification status changes."
                            />
                        </div>
                    ) : (
                        notifications.map((notif) => (
                            <div
                                key={notif.id}
                                className="feed-card"
                                style={{
                                    opacity: notif.read ? 0.7 : 1,
                                    background: notif.read ? undefined : "var(--brand-2-10)", // Add a subtle highlight to unread items
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--spacing-md)" }}>
                                    <div className="stack" style={{ gap: "6px", flex: 1 }}>
                                        <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "center", flexWrap: "wrap" }}>
                                            <span className="pill" style={{ padding: "3px 8px", fontSize: "var(--font-xs)", background: "var(--surface-2)" }}>
                                                {TYPE_LABELS[notif.type] ?? notif.type}
                                            </span>
                                            <span className="muted-text" style={{ fontSize: "var(--font-xs)" }}>{formatDate(notif.createdAt).split(",")[0]}</span>
                                            {!notif.read && (
                                                <span style={{ width: 7, height: 7, background: "var(--brand)", borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                                            )}
                                        </div>
                                        <div style={{ fontWeight: 600, fontSize: "1rem", color: "var(--ink)" }}>{notif.title}</div>
                                        <div className="muted-text" style={{ fontSize: "var(--font-sm)" }}>{notif.body}</div>
                                    </div>
                                    {!notif.read && (
                                        <Button
                                            variant="ghost"
                                            onClick={() => void onMarkRead(notif.id)}
                                            style={{ flexShrink: 0 }}
                                        >
                                            Mark read
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    {total > notifications.length && (
                        <div style={{ padding: "var(--spacing-xl)", textAlign: "center" }}>
                            <p className="muted-text">Showing {notifications.length} of {total} notifications</p>
                        </div>
                    )}
                </div>
            </RequireSession>
        </PageShell>
    );
}
