"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
    Banner,
    Button,
    Card,
    EmptyState,
    SectionHeader
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
            setNotifications((prev) =>
                prev.map((n) => (n.id === updated.id ? updated : n))
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to mark as read");
        }
    };

    const onMarkAllRead = async (): Promise<void> => {
        if (!accessToken) return;
        try {
            await markAllNotificationsRead(accessToken);
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })));
            setUnreadCount(0);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to mark all as read");
        }
    };

    return (
        <PageShell>
            <section className="section">
                <div className="container stack">
                    <SectionHeader
                        eyebrow="Notifications"
                        title="Stay updated"
                        subtitle="Job updates, connection requests, verification status, and more."
                    />
                    <RequireSession>
                        <div className="stack">
                            {error ? <Banner tone="error">{error}</Banner> : null}

                            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                                <span className="pill" style={{ padding: "6px 12px" }}>
                                    {unreadCount} unread
                                </span>
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowUnreadOnly((prev) => !prev)}
                                >
                                    {showUnreadOnly ? "Show all" : "Show unread only"}
                                </Button>
                                {unreadCount > 0 ? (
                                    <Button variant="ghost" onClick={() => void onMarkAllRead()}>
                                        Mark all read
                                    </Button>
                                ) : null}
                            </div>

                            {loading ? (
                                <p className="muted-text">Loading notifications...</p>
                            ) : notifications.length === 0 ? (
                                <EmptyState
                                    title="No notifications yet"
                                    body="You'll receive notifications when someone applies to your jobs, sends a connection request, or your verification status changes."
                                />
                            ) : (
                                <div className="stack">
                                    {notifications.map((notif) => (
                                        <div
                                            key={notif.id}
                                            className="card"
                                            style={{
                                                opacity: notif.read ? 0.7 : 1,
                                                borderLeft: notif.read ? "none" : "3px solid var(--accent)"
                                            }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                                                <div className="stack" style={{ gap: "4px", flex: 1 }}>
                                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                                        <span className="pill" style={{ padding: "4px 8px", fontSize: "0.75rem" }}>
                                                            {TYPE_LABELS[notif.type] ?? notif.type}
                                                        </span>
                                                        <span className="field-hint">{formatDate(notif.createdAt)}</span>
                                                    </div>
                                                    <div className="data-title">{notif.title}</div>
                                                    <div className="data-meta">{notif.body}</div>
                                                </div>
                                                {!notif.read ? (
                                                    <Button
                                                        variant="ghost"
                                                        onClick={() => void onMarkRead(notif.id)}
                                                        style={{ flexShrink: 0 }}
                                                    >
                                                        Mark read
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                    {total > notifications.length ? (
                                        <p className="muted-text" style={{ textAlign: "center" }}>
                                            Showing {notifications.length} of {total} notifications
                                        </p>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </RequireSession>
                </div>
            </section>
        </PageShell>
    );
}
