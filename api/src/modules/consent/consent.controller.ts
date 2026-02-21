import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import {
  AccessRequestRecord,
  ConsentGrantRecord,
  ConsentService
} from "./consent.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { CheckConsentVisibilityDto } from "./dto/check-consent-visibility.dto";
import { GrantAccessDto } from "./dto/grant-access.dto";
import { RequestAccessDto } from "./dto/request-access.dto";
import { RevokeAccessDto } from "./dto/revoke-access.dto";

@Controller("consent")
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get("requests")
  listRequests(@CurrentUser() user: AuthenticatedUser): Promise<AccessRequestRecord[]> {
    return this.consentService.listRequests(user.userId);
  }

  @Get("grants")
  listGrants(@CurrentUser() user: AuthenticatedUser): Promise<ConsentGrantRecord[]> {
    return this.consentService.listGrants(user.userId);
  }

  @Post("request-access")
  requestAccess(
    @Body() body: RequestAccessDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<AccessRequestRecord> {
    return this.consentService.requestAccess({
      requesterUserId: user.userId,
      ownerUserId: body.ownerUserId,
      connectionId: body.connectionId,
      requestedFields: body.requestedFields,
      purpose: body.purpose
    });
  }

  @Post(":requestId/grant")
  grant(
    @Param("requestId") requestId: string,
    @Body() body: GrantAccessDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ConsentGrantRecord> {
    return this.consentService.grant(requestId, {
      ownerUserId: user.userId,
      grantedFields: body.grantedFields,
      expiresAt: body.expiresAt,
      purpose: body.purpose
    });
  }

  @Post(":grantId/revoke")
  revoke(
    @Param("grantId") grantId: string,
    @Body() body: RevokeAccessDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ConsentGrantRecord> {
    return this.consentService.revoke(grantId, {
      ownerUserId: user.userId,
      reason: body.reason
    });
  }

  @Post("can-view")
  canView(
    @Body() body: CheckConsentVisibilityDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<{ allowed: boolean }> {
    return this.consentService.canView({
      actorUserId: user.userId,
      ownerUserId: body.ownerUserId,
      field: body.field
    });
  }
}
