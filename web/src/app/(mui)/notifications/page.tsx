"use client";

import { alertCategory, alertDestination, formatUiError } from "@illamhelp/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import { Banner, Button, EmptyState, SectionHeader, Skeleton, StatusLabel } from "@/components/ui/primitives";
import { formatDate, listNotifications, markAllNotificationsRead, markNotificationRead, type NotificationRecord } from "@/lib/api";

export default function NotificationsPage(): JSX.Element {
    const { accessToken } = useSession();
    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const [unreadCount, setUnreadCount] = useState<number>();
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    const [updating, setUpdating] = useState<string | null>(null);

    const load = useCallback(async (cursor?: string): Promise<void> => {
        if (!accessToken) return;
        setLoading(true);
        setError(null);
        try {
            const result = await listNotifications({ unreadOnly: showUnreadOnly, limit: 50, cursor }, accessToken);
            setNotifications((previous) => cursor ? [...previous, ...result.items] : result.items);
            setUnreadCount(result.unreadCount);
            setNextCursor(result.nextCursor);
        } catch (err) {
            setError(formatUiError(err, "Couldn’t load alerts. Refresh to try again."));
        } finally {
            setLoading(false);
        }
    }, [accessToken, showUnreadOnly]);

    useEffect(() => { void load(); }, [load]);

    const busy = loading || !!updating;
    const markRead = async (notification: NotificationRecord): Promise<void> => {
        if (!accessToken || busy || notification.read) return;
        setUpdating(notification.id);
        setError(null);
        try {
            const updated = await markNotificationRead(notification.id, accessToken);
            setNotifications((previous) => showUnreadOnly
                ? previous.filter((item) => item.id !== updated.id)
                : previous.map((item) => item.id === updated.id ? updated : item));
            setUnreadCount((previous) => Math.max(0, (previous ?? 0) - 1));
        } catch (err) {
            setError(formatUiError(err, "Couldn’t mark this alert as read. Try again."));
        } finally {
            setUpdating(null);
        }
    };

    const markAllRead = async (): Promise<void> => {
        if (!accessToken || busy || !unreadCount) return;
        setUpdating("all");
        setError(null);
        try {
            const { updated } = await markAllNotificationsRead(accessToken);
            setNotifications((previous) => showUnreadOnly ? [] : previous.map((item) => ({ ...item, read: true })));
            setUnreadCount((previous) => Math.max(0, (previous ?? 0) - updated));
            await load();
        } catch (err) {
            setError(formatUiError(err, "Couldn’t mark all alerts as read. Try again."));
        } finally {
            setUpdating(null);
        }
    };

    const chooseFilter = (unread: boolean): void => {
        if (busy || unread === showUnreadOnly) return;
        setLoading(true);
        setShowUnreadOnly(unread);
        setNotifications([]);
        setNextCursor(null);
    };

    return (
        <PageShell unreadCount={unreadCount}>
            <section className="section">
                <div className="container stack alerts-feed">
                    <SectionHeader title="Alerts" subtitle="Updates about jobs, connections, contact sharing, and verification." />
                    <RequireSession>
                        <div className="stack">
                            <div className="alerts-toolbar">
                                <div className="alert-actions" role="group" aria-label="Filter alerts">
                                    <Button type="button" variant={showUnreadOnly ? "secondary" : "primary"} aria-pressed={!showUnreadOnly} disabled={busy} onClick={() => chooseFilter(false)}>All alerts</Button>
                                    <Button type="button" variant={showUnreadOnly ? "primary" : "secondary"} aria-pressed={showUnreadOnly} disabled={busy} onClick={() => chooseFilter(true)}>Unread only</Button>
                                </div>
                                <div className="alert-actions">
                                    {unreadCount !== undefined ? (
                                        <span role="status" data-testid="alerts-unread-count">{unreadCount} unread</span>
                                    ) : null}
                                    {unreadCount ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void markAllRead()}>{updating === "all" ? "Marking alerts…" : "Mark all as read"}</Button> : null}
                                    <Button type="button" variant="ghost" disabled={busy} onClick={() => void load()}>Refresh alerts</Button>
                                </div>
                            </div>
                            {error ? <Banner tone="error">{error}</Banner> : null}
                            {loading && !notifications.length ? <Skeleton lines={4} /> : null}
                            {!loading && !error && !notifications.length ? (
                                <EmptyState title={showUnreadOnly ? "No unread alerts" : "No alerts yet"}
                                    body={showUnreadOnly ? "Choose All alerts to see earlier updates." : "New activity will appear here."} />
                            ) : null}
                            {notifications.length ? (
                                <div className="card-row-list">
                                    {notifications.map((item) => {
                                        const action = alertDestination(item.type, item.data);
                                        return (
                                            <article key={item.id} className="card-list-row alert-entry">
                                                <div className="alert-metadata">
                                                    <span>{alertCategory(item.type)}</span>
                                                    <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                                                    {!item.read ? <StatusLabel tone="info">Unread</StatusLabel> : null}
                                                </div>
                                                <h2>{item.title}</h2>
                                                <p className="muted-text">{item.body}</p>
                                                {action || !item.read ? (
                                                    <div className="alert-actions">
                                                        {action ? <Link className="button secondary" href={action.href}>{action.label}</Link> : null}
                                                        {!item.read ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void markRead(item)}>
                                                            {updating === item.id ? "Marking alert…" : "Mark as read"}
                                                        </Button> : null}
                                                    </div>
                                                ) : null}
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : null}
                            {nextCursor ? (
                                <div><Button type="button" variant="secondary" disabled={busy} onClick={() => void load(nextCursor)}>
                                    {loading ? "Loading alerts…" : "Load more alerts"}
                                </Button></div>
                            ) : null}
                        </div>
                    </RequireSession>
                </div>
            </section>
        </PageShell>
    );
}
