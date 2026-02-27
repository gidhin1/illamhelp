import { Body, Controller, Get, Param, Patch } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ProfileRecord, ProfilesService } from "./profiles.service";

@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): Promise<ProfileRecord> {
    return this.profilesService.getOwnProfile(user.userId);
  }

  @Patch("me")
  updateMe(
    @Body() body: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ProfileRecord> {
    return this.profilesService.updateOwnProfile(user.userId, body);
  }

  @Get(":userId")
  getById(
    @Param("userId") targetUserId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ProfileRecord> {
    return this.profilesService.getProfileForViewer(targetUserId, user.userId);
  }
}
