import { Body, Controller, Get, Post } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { CreateJobDto } from "./dto/create-job.dto";
import { JobRecord, JobsService } from "./jobs.service";

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  list(): Promise<JobRecord[]> {
    return this.jobsService.list();
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
      locationText: body.locationText
    });
  }
}
