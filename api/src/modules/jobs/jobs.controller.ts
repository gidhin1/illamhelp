import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { ApplyJobDto } from "./dto/apply-job.dto";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateJobDto } from "./dto/create-job.dto";
import { RejectJobApplicationDto } from "./dto/reject-job-application.dto";
import { SearchJobsDto } from "./dto/search-jobs.dto";
import {
  JobApplicationRecord,
  JobRecord,
  JobsService
} from "./jobs.service";

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) { }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ): Promise<{ items: JobRecord[]; total: number; limit: number; offset: number }> {
    return this.jobsService.list(
      user.userId,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined
    );
  }

  @Get("search")
  search(@Query() query: SearchJobsDto, @CurrentUser() user: AuthenticatedUser): Promise<JobRecord[]> {
    return this.jobsService.search({
      q: query.q,
      category: query.category,
      locationText: query.locationText,
      minSeekerRating: query.minSeekerRating,
      statuses: query.statuses,
      visibility: query.visibility,
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radiusKm,
      limit: query.limit
    }, user.userId);
  }

  @Post()
  create(
    @Body() body: CreateJobDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobRecord> {
    return this.jobsService.create({
      seekerUserId: user.userId,
      category: body.category,
      title: body.title,
      description: body.description,
      locationText: body.locationText,
      visibility: body.visibility,
      locationLatitude: body.locationLatitude,
      locationLongitude: body.locationLongitude
    });
  }

  @Post(":id/apply")
  apply(
    @Param("id") jobId: string,
    @Body() body: ApplyJobDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobApplicationRecord> {
    return this.jobsService.apply({
      jobId,
      providerUserId: user.userId,
      message: body.message
    });
  }

  @Get(":id/applications")
  listApplications(
    @Param("id") jobId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobApplicationRecord[]> {
    return this.jobsService.listApplications(jobId, user.userId);
  }

  @Get("applications/mine")
  listMyApplications(@CurrentUser() user: AuthenticatedUser): Promise<JobApplicationRecord[]> {
    return this.jobsService.listMyApplications(user.userId);
  }

  @Post("applications/:applicationId/accept")
  acceptApplication(
    @Param("applicationId") applicationId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobApplicationRecord> {
    return this.jobsService.acceptApplication({
      applicationId,
      seekerUserId: user.userId
    });
  }

  @Post("applications/:applicationId/reject")
  rejectApplication(
    @Param("applicationId") applicationId: string,
    @Body() body: RejectJobApplicationDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobApplicationRecord> {
    return this.jobsService.rejectApplication({
      applicationId,
      seekerUserId: user.userId,
      reason: body.reason
    });
  }

  @Post("applications/:applicationId/withdraw")
  withdrawApplication(
    @Param("applicationId") applicationId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobApplicationRecord> {
    return this.jobsService.withdrawApplication({
      applicationId,
      providerUserId: user.userId
    });
  }

  @Post(":id/booking/start")
  startBooking(
    @Param("id") jobId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobRecord> {
    return this.jobsService.startBooking({
      jobId,
      actorUserId: user.userId
    });
  }

  @Post(":id/booking/complete")
  completeBooking(
    @Param("id") jobId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobRecord> {
    return this.jobsService.completeBooking({
      jobId,
      actorUserId: user.userId
    });
  }

  @Post(":id/booking/payment-done")
  markPaymentDone(
    @Param("id") jobId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobRecord> {
    return this.jobsService.markPaymentDone({
      jobId,
      actorUserId: user.userId
    });
  }

  @Post(":id/booking/payment-received")
  markPaymentReceived(
    @Param("id") jobId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobRecord> {
    return this.jobsService.markPaymentReceived({
      jobId,
      actorUserId: user.userId
    });
  }

  @Post(":id/booking/close")
  closeBooking(
    @Param("id") jobId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobRecord> {
    return this.jobsService.closeBooking({
      jobId,
      actorUserId: user.userId
    });
  }

  @Post(":id/booking/cancel")
  cancelBooking(
    @Param("id") jobId: string,
    @Body() body: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<JobRecord> {
    return this.jobsService.cancelBooking({
      jobId,
      actorUserId: user.userId,
      reason: body.reason
    });
  }
}
