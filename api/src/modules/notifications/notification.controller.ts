import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { NotificationRecord, NotificationService } from "./notification.service";

@Controller("notifications")
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    @Get()
    list(
        @CurrentUser() user: AuthenticatedUser,
        @Query("unreadOnly") unreadOnly?: string,
        @Query("limit") limit?: string,
        @Query("offset") offset?: string
    ): Promise<{
        items: NotificationRecord[];
        total: number;
        limit: number;
        offset: number;
        unreadCount: number;
    }> {
        return this.notificationService.list({
            userId: user.userId,
            unreadOnly: unreadOnly === "true",
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined
        });
    }

    @Get("unread-count")
    getUnreadCount(
        @CurrentUser() user: AuthenticatedUser
    ): Promise<{ unreadCount: number }> {
        return this.notificationService.getUnreadCount(user.userId);
    }

    @Patch(":id/read")
    markRead(
        @Param("id") notificationId: string,
        @CurrentUser() user: AuthenticatedUser
    ): Promise<NotificationRecord> {
        return this.notificationService.markRead(notificationId, user.userId);
    }

    @Patch("read-all")
    markAllRead(
        @CurrentUser() user: AuthenticatedUser
    ): Promise<{ updated: number }> {
        return this.notificationService.markAllRead(user.userId);
    }
}
