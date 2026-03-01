import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import {
  ConnectionRecord,
  ConnectionSearchCandidate,
  ConnectionsService
} from "./connections.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { RequestConnectionDto } from "./dto/request-connection.dto";
import { SearchConnectionsDto } from "./dto/search-connections.dto";

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) { }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ): Promise<{ items: ConnectionRecord[]; total: number; limit: number; offset: number }> {
    return this.connectionsService.list(
      user.userId,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined
    );
  }

  @Get("search")
  search(
    @Query() query: SearchConnectionsDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ConnectionSearchCandidate[]> {
    return this.connectionsService.searchCandidates(
      user.userId,
      query.q,
      query.limit
    );
  }

  @Post("request")
  request(
    @Body() body: RequestConnectionDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ConnectionRecord> {
    return this.connectionsService.request({
      requesterUserId: user.userId,
      targetUserId: body.targetUserId,
      targetQuery: body.targetQuery
    });
  }

  @Post(":id/accept")
  accept(
    @Param("id") connectionId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ConnectionRecord> {
    return this.connectionsService.accept(connectionId, user.userId);
  }

  @Post(":id/decline")
  decline(
    @Param("id") connectionId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ConnectionRecord> {
    return this.connectionsService.decline(connectionId, user.userId);
  }

  @Post(":id/block")
  block(
    @Param("id") connectionId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ConnectionRecord> {
    return this.connectionsService.block(connectionId, user.userId);
  }
}
