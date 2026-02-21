import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { ConnectionRecord, ConnectionsService } from "./connections.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { RequestConnectionDto } from "./dto/request-connection.dto";

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ConnectionRecord[]> {
    return this.connectionsService.list(user.userId);
  }

  @Post("request")
  request(
    @Body() body: RequestConnectionDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ConnectionRecord> {
    return this.connectionsService.request({
      requesterUserId: user.userId,
      targetUserId: body.targetUserId
    });
  }

  @Post(":id/accept")
  accept(
    @Param("id") connectionId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ConnectionRecord> {
    return this.connectionsService.accept(connectionId, user.userId);
  }
}
