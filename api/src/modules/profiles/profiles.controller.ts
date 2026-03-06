import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { SubmitVerificationDto } from "./dto/submit-verification.dto";
import { ProfileRecord, ProfilesService } from "./profiles.service";
import { VerificationRecord, VerificationService } from "./verification.service";

@Controller("profiles")
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly verificationService: VerificationService
  ) { }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): Promise<ProfileRecord> {
    return this.profilesService.getOwnProfile(user.userId);
  }

  @Get("me/dashboard")
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.getDashboard(user.userId);
  }

  @Patch("me")
  updateMe(
    @Body() body: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ProfileRecord> {
    return this.profilesService.updateOwnProfile(user.userId, body);
  }

  @Post("me/verification")
  submitVerification(
    @Body() body: SubmitVerificationDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<VerificationRecord> {
    return this.verificationService.submit({
      actorUserId: user.userId,
      documentType: body.documentType,
      documentMediaIds: body.documentMediaIds,
      notes: body.notes
    });
  }

  @Get("me/verification")
  getMyVerification(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<VerificationRecord | null> {
    return this.verificationService.getMyVerification(user.userId);
  }

  @Get(":userId")
  getById(
    @Param("userId") targetUserId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ProfileRecord> {
    return this.profilesService.getProfileForViewer(targetUserId, user.userId);
  }
}
