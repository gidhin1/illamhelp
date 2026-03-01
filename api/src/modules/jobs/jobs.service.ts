import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";
import { escapeIlikeLiteral } from "../../common/utils/sql";
import { AuditService } from "../audit/audit.service";
import {
  JobsSearchService,
  type SearchIndexedJobInput
} from "./jobs-search.service";

export type JobStatus =
  | "posted"
  | "accepted"
  | "in_progress"
  | "completed"
  | "payment_done"
  | "payment_received"
  | "closed"
  | "cancelled";
export type JobVisibility = "public" | "connections_only";
type ApplicationStatus = "applied" | "shortlisted" | "accepted" | "rejected" | "withdrawn";

export interface CreateJobInput {
  seekerUserId: string;
  category: string;
  title: string;
  description: string;
  locationText: string;
  visibility: JobVisibility;
  locationLatitude?: number;
  locationLongitude?: number;
}

export interface JobRecord extends CreateJobInput {
  id: string;
  status: JobStatus;
  assignedProviderUserId: string | null;
  acceptedApplicationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchJobsInput {
  q?: string;
  category?: string;
  locationText?: string;
  minSeekerRating?: number;
  statuses?: JobStatus[];
  visibility?: JobVisibility;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  limit?: number;
}

export interface ApplyJobInput {
  jobId: string;
  providerUserId: string;
  message?: string;
}

export interface JobApplicationRecord {
  id: string;
  jobId: string;
  providerUserId: string;
  status: ApplicationStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecideApplicationInput {
  applicationId: string;
  seekerUserId: string;
  reason?: string;
}

export interface WithdrawApplicationInput {
  applicationId: string;
  providerUserId: string;
}

export interface UpdateBookingInput {
  jobId: string;
  actorUserId: string;
  reason?: string;
}

interface DbJobRow {
  id: string;
  seeker_user_id: string;
  category: string;
  title: string;
  description: string;
  location_text: string;
  visibility?: JobVisibility | null;
  location_latitude: number | null;
  location_longitude: number | null;
  status: JobStatus;
  assigned_provider_user_id: string | null;
  accepted_application_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DbSearchJobRow extends DbJobRow {
  seeker_rating: number | null;
}

interface DbJobApplicationRow {
  id: string;
  job_id: string;
  provider_user_id: string;
  status: ApplicationStatus;
  message: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DbApplicationWithJobRow extends DbJobApplicationRow {
  seeker_user_id: string;
  job_status: JobStatus;
  assigned_provider_user_id: string | null;
  accepted_application_id: string | null;
}

@Injectable()
export class JobsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    @Optional() private readonly jobsSearchService?: JobsSearchService
  ) { }

  async create(input: CreateJobInput): Promise<JobRecord> {
    assertUuid(input.seekerUserId, "seekerUserId");
    const hasLatitude = typeof input.locationLatitude === "number";
    const hasLongitude = typeof input.locationLongitude === "number";
    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        "locationLatitude and locationLongitude must be provided together"
      );
    }

    const result = await this.databaseService.query<DbJobRow>(
      `
      INSERT INTO jobs (
        seeker_user_id,
        category,
        title,
        description,
        location_text,
        visibility,
        location_latitude,
        location_longitude
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6::job_visibility, $7::double precision, $8::double precision)
      RETURNING
        id,
        seeker_user_id,
        category,
        title,
        description,
        location_text,
        visibility,
        location_latitude,
        location_longitude,
        status,
        assigned_provider_user_id,
        accepted_application_id,
        created_at,
        updated_at
      `,
      [
        input.seekerUserId,
        input.category,
        input.title,
        input.description,
        input.locationText,
        input.visibility,
        input.locationLatitude ?? null,
        input.locationLongitude ?? null
      ]
    );

    const job = this.mapJobRow(result.rows[0]);
    await this.auditService.logEvent({
      actorUserId: input.seekerUserId,
      targetUserId: input.seekerUserId,
      eventType: "job_posted",
      metadata: {
        jobId: job.id,
        category: job.category
      }
    });
    await this.syncSearchIndex(job);

    return this.getPublicJobById(job.id);
  }

  async list(
    actorUserId: string,
    limit = 50,
    offset = 0
  ): Promise<{ items: JobRecord[]; total: number; limit: number; offset: number }> {
    assertUuid(actorUserId, "actorUserId");
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 50, 100));
    const safeOffset = Math.max(0, Math.trunc(offset) || 0);

    const countResult = await this.databaseService.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM jobs j
      WHERE
        j.seeker_user_id = $1::uuid
        OR j.assigned_provider_user_id = $1::uuid
        OR (
          j.status = 'posted'::job_status
          AND (
            j.visibility = 'public'::job_visibility
            OR (
              j.visibility = 'connections_only'::job_visibility
              AND EXISTS (
                SELECT 1
                FROM connections c
                WHERE c.status = 'accepted'::connection_status
                  AND (
                    (c.user_a_id = $1::uuid AND c.user_b_id = j.seeker_user_id)
                    OR
                    (c.user_b_id = $1::uuid AND c.user_a_id = j.seeker_user_id)
                  )
              )
            )
          )
        )
      `,
      [actorUserId]
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const result = await this.databaseService.query<DbJobRow>(
      `
      SELECT
        id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = seeker_user_id)), ''), 'member_' || SUBSTRING(md5(seeker_user_id::text) FROM 1 FOR 10)) AS seeker_user_id,
        category,
        title,
        description,
        location_text,
        visibility,
        location_latitude,
        location_longitude,
        status,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = assigned_provider_user_id)), ''), 'member_' || SUBSTRING(md5(assigned_provider_user_id::text) FROM 1 FOR 10)) AS assigned_provider_user_id,
        accepted_application_id,
        created_at,
        updated_at
      FROM jobs
      WHERE
        seeker_user_id = $1::uuid
        OR assigned_provider_user_id = $1::uuid
        OR (
          status = 'posted'::job_status
          AND (
            visibility = 'public'::job_visibility
            OR (
              visibility = 'connections_only'::job_visibility
              AND EXISTS (
                SELECT 1
                FROM connections c
                WHERE c.status = 'accepted'::connection_status
                  AND (
                    (c.user_a_id = $1::uuid AND c.user_b_id = jobs.seeker_user_id)
                    OR
                    (c.user_b_id = $1::uuid AND c.user_a_id = jobs.seeker_user_id)
                  )
              )
            )
          )
        )
      ORDER BY created_at DESC
      LIMIT $2::int OFFSET $3::int
      `,
      [actorUserId, safeLimit, safeOffset]
    );

    return {
      items: result.rows.map((row) => this.mapJobRow(row)),
      total,
      limit: safeLimit,
      offset: safeOffset
    };
  }

  async search(input: SearchJobsInput, actorUserId: string): Promise<JobRecord[]> {
    assertUuid(actorUserId, "actorUserId");
    const normalized = this.normalizeSearchInput(input);
    this.assertGeoInputConsistency(
      normalized.latitude,
      normalized.longitude,
      normalized.radiusKm
    );

    if (!normalized.statuses || normalized.statuses.length === 0) {
      normalized.statuses = ["posted"];
    }

    if (this.jobsSearchService?.isEnabled()) {
      const searchResult = await this.jobsSearchService.searchJobIds(normalized);
      if (searchResult.available) {
        if (searchResult.ids.length === 0) {
          return [];
        }
        return this.searchInDatabase(normalized, actorUserId, searchResult.ids);
      }
    }

    return this.searchInDatabase(normalized, actorUserId);
  }

  async apply(input: ApplyJobInput): Promise<JobApplicationRecord> {
    assertUuid(input.jobId, "jobId");
    assertUuid(input.providerUserId, "providerUserId");

    const job = await this.getJobOrThrow(input.jobId);
    if (job.seeker_user_id === input.providerUserId) {
      throw new BadRequestException("Job owner cannot apply to own job");
    }
    if (job.status !== "posted") {
      throw new BadRequestException("Applications are closed for this job");
    }
    if (job.visibility === "connections_only") {
      const canAccess = await this.hasAcceptedConnection(job.seeker_user_id, input.providerUserId);
      if (!canAccess) {
        throw new BadRequestException(
          "This job is visible to accepted connections only. Connect with the owner first."
        );
      }
    }

    const upsert = await this.databaseService.query<DbJobApplicationRow>(
      `
      INSERT INTO job_applications (
        job_id,
        provider_user_id,
        status,
        message
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'applied'::application_status,
        $3::text
      )
      ON CONFLICT (job_id, provider_user_id)
      DO UPDATE SET
        status = 'applied'::application_status,
        message = EXCLUDED.message,
        updated_at = now()
      WHERE job_applications.status = 'withdrawn'::application_status
      RETURNING id, job_id, provider_user_id, status, message, created_at, updated_at
      `,
      [input.jobId, input.providerUserId, input.message?.trim() || null]
    );

    if (!upsert.rowCount) {
      throw new BadRequestException("Application already exists for this job");
    }

    const application = this.mapApplicationRow(upsert.rows[0]);
    await this.auditService.logEvent({
      actorUserId: input.providerUserId,
      targetUserId: job.seeker_user_id,
      eventType: "job_application_submitted",
      metadata: {
        jobId: application.jobId,
        applicationId: application.id
      }
    });

    return application;
  }

  async listApplications(jobId: string, actorUserId: string): Promise<JobApplicationRecord[]> {
    assertUuid(jobId, "jobId");
    assertUuid(actorUserId, "actorUserId");

    const job = await this.getJobOrThrow(jobId);
    const isOwner = job.seeker_user_id === actorUserId;

    const result = await this.databaseService.query<DbJobApplicationRow>(
      `
      SELECT id, job_id, provider_user_id, status, message, created_at, updated_at
      FROM job_applications
      WHERE job_id = $1::uuid
        AND (
          $2::boolean = true
          OR provider_user_id = $3::uuid
        )
      ORDER BY created_at DESC
      `,
      [jobId, isOwner, actorUserId]
    );

    return result.rows.map((row) => this.mapApplicationRow(row));
  }

  async listMyApplications(actorUserId: string): Promise<JobApplicationRecord[]> {
    assertUuid(actorUserId, "actorUserId");

    const result = await this.databaseService.query<DbJobApplicationRow>(
      `
      SELECT id, job_id, provider_user_id, status, message, created_at, updated_at
      FROM job_applications
      WHERE provider_user_id = $1::uuid
      ORDER BY created_at DESC
      `,
      [actorUserId]
    );

    return result.rows.map((row) => this.mapApplicationRow(row));
  }

  async acceptApplication(input: DecideApplicationInput): Promise<JobApplicationRecord> {
    assertUuid(input.applicationId, "applicationId");
    assertUuid(input.seekerUserId, "seekerUserId");

    const application = await this.getApplicationWithJobOrThrow(input.applicationId);
    if (application.seeker_user_id !== input.seekerUserId) {
      throw new BadRequestException("Only job owner can accept applications");
    }
    if (application.status !== "applied" && application.status !== "shortlisted") {
      throw new BadRequestException("Only active applications can be accepted");
    }
    if (application.job_status !== "posted") {
      throw new BadRequestException("Job is no longer open for acceptance");
    }

    const accepted = await this.databaseService.transaction(async (query) => {
      const acceptedResult = await query<DbJobApplicationRow>(
        `
        UPDATE job_applications
        SET
          status = 'accepted'::application_status,
          updated_at = now()
        WHERE id = $1::uuid
        RETURNING id, job_id, provider_user_id, status, message, created_at, updated_at
        `,
        [input.applicationId]
      );

      await query(
        `
        UPDATE job_applications
        SET
          status = 'rejected'::application_status,
          updated_at = now()
        WHERE job_id = $1::uuid
          AND id <> $2::uuid
          AND status IN ('applied'::application_status, 'shortlisted'::application_status)
        `,
        [application.job_id, input.applicationId]
      );

      const jobUpdate = await query(
        `
        UPDATE jobs
        SET
          status = 'accepted'::job_status,
          assigned_provider_user_id = $2::uuid,
          accepted_application_id = $3::uuid,
          updated_at = now()
        WHERE id = $1::uuid
          AND status = 'posted'::job_status
        `,
        [application.job_id, application.provider_user_id, input.applicationId]
      );

      if (!jobUpdate.rowCount) {
        throw new BadRequestException("Job acceptance state changed; retry the operation");
      }

      return acceptedResult;
    });

    await this.syncSearchIndex(this.mapJobRow(await this.getJobOrThrow(application.job_id)));

    await this.auditService.logEvent({
      actorUserId: input.seekerUserId,
      targetUserId: application.provider_user_id,
      eventType: "job_application_accepted",
      metadata: {
        applicationId: input.applicationId,
        jobId: application.job_id
      }
    });

    return this.mapApplicationRow(accepted.rows[0]);
  }

  async rejectApplication(input: DecideApplicationInput): Promise<JobApplicationRecord> {
    assertUuid(input.applicationId, "applicationId");
    assertUuid(input.seekerUserId, "seekerUserId");

    const application = await this.getApplicationWithJobOrThrow(input.applicationId);
    if (application.seeker_user_id !== input.seekerUserId) {
      throw new BadRequestException("Only job owner can reject applications");
    }
    if (application.status === "rejected") {
      return this.mapApplicationRow(application);
    }
    if (application.status === "withdrawn") {
      throw new BadRequestException("Cannot reject an application already withdrawn");
    }
    if (application.status === "accepted") {
      throw new BadRequestException("Accepted application cannot be rejected directly");
    }

    const updated = await this.databaseService.query<DbJobApplicationRow>(
      `
      UPDATE job_applications
      SET
        status = 'rejected'::application_status,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING id, job_id, provider_user_id, status, message, created_at, updated_at
      `,
      [input.applicationId]
    );

    await this.auditService.logEvent({
      actorUserId: input.seekerUserId,
      targetUserId: application.provider_user_id,
      eventType: "job_application_rejected",
      metadata: {
        applicationId: input.applicationId,
        jobId: application.job_id,
        reason: input.reason?.trim() || null
      }
    });

    return this.mapApplicationRow(updated.rows[0]);
  }

  async withdrawApplication(input: WithdrawApplicationInput): Promise<JobApplicationRecord> {
    assertUuid(input.applicationId, "applicationId");
    assertUuid(input.providerUserId, "providerUserId");

    const application = await this.getApplicationWithJobOrThrow(input.applicationId);
    if (application.provider_user_id !== input.providerUserId) {
      throw new BadRequestException("Only applicant can withdraw this application");
    }
    if (application.status === "withdrawn") {
      return this.mapApplicationRow(application);
    }
    if (application.status === "accepted") {
      throw new BadRequestException(
        "Accepted application cannot be withdrawn directly. Use booking cancel."
      );
    }
    if (application.status === "rejected") {
      throw new BadRequestException("Rejected application cannot be withdrawn");
    }

    const updated = await this.databaseService.query<DbJobApplicationRow>(
      `
      UPDATE job_applications
      SET
        status = 'withdrawn'::application_status,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING id, job_id, provider_user_id, status, message, created_at, updated_at
      `,
      [input.applicationId]
    );

    await this.auditService.logEvent({
      actorUserId: input.providerUserId,
      targetUserId: application.seeker_user_id,
      eventType: "job_application_withdrawn",
      metadata: {
        applicationId: input.applicationId,
        jobId: application.job_id
      }
    });

    return this.mapApplicationRow(updated.rows[0]);
  }

  async startBooking(input: UpdateBookingInput): Promise<JobRecord> {
    assertUuid(input.jobId, "jobId");
    assertUuid(input.actorUserId, "actorUserId");

    const job = await this.getJobOrThrow(input.jobId);
    if (job.status !== "accepted") {
      throw new BadRequestException("Only accepted jobs can be started");
    }
    if (!job.assigned_provider_user_id || job.assigned_provider_user_id !== input.actorUserId) {
      throw new BadRequestException("Only assigned provider can start this booking");
    }

    const updated = await this.databaseService.query<DbJobRow>(
      `
      UPDATE jobs
      SET
        status = 'in_progress'::job_status,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING
        id,
        seeker_user_id,
        category,
        title,
        description,
        location_text,
        visibility,
        location_latitude,
        location_longitude,
        status,
        assigned_provider_user_id,
        accepted_application_id,
        created_at,
        updated_at
      `,
      [input.jobId]
    );

    const internalRecord = this.mapJobRow(updated.rows[0]);
    await this.auditService.logEvent({
      actorUserId: input.actorUserId,
      targetUserId: job.seeker_user_id,
      eventType: "booking_started",
      metadata: {
        jobId: internalRecord.id,
        acceptedApplicationId: internalRecord.acceptedApplicationId
      }
    });
    await this.syncSearchIndex(internalRecord);

    return this.getPublicJobById(internalRecord.id);
  }

  async completeBooking(input: UpdateBookingInput): Promise<JobRecord> {
    assertUuid(input.jobId, "jobId");
    assertUuid(input.actorUserId, "actorUserId");

    const job = await this.getJobOrThrow(input.jobId);
    if (job.status !== "in_progress") {
      throw new BadRequestException("Only in-progress jobs can be completed");
    }
    if (job.seeker_user_id !== input.actorUserId) {
      throw new BadRequestException("Only job owner can complete this booking");
    }

    const updated = await this.databaseService.query<DbJobRow>(
      `
      UPDATE jobs
      SET
        status = 'completed'::job_status,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING
        id,
        seeker_user_id,
        category,
        title,
        description,
        location_text,
        visibility,
        location_latitude,
        location_longitude,
        status,
        assigned_provider_user_id,
        accepted_application_id,
        created_at,
        updated_at
      `,
      [input.jobId]
    );

    const internalRecord = this.mapJobRow(updated.rows[0]);
    await this.auditService.logEvent({
      actorUserId: input.actorUserId,
      targetUserId: job.assigned_provider_user_id ?? undefined,
      eventType: "booking_completed",
      metadata: {
        jobId: internalRecord.id,
        acceptedApplicationId: internalRecord.acceptedApplicationId
      }
    });
    await this.syncSearchIndex(internalRecord);

    return this.getPublicJobById(internalRecord.id);
  }

  async markPaymentDone(input: UpdateBookingInput): Promise<JobRecord> {
    assertUuid(input.jobId, "jobId");
    assertUuid(input.actorUserId, "actorUserId");

    const job = await this.getJobOrThrow(input.jobId);
    if (job.status !== "completed") {
      throw new BadRequestException("Payment can be marked done only after job completion");
    }
    if (job.seeker_user_id !== input.actorUserId) {
      throw new BadRequestException("Only job owner can mark payment done");
    }

    const updated = await this.databaseService.query<DbJobRow>(
      `
      UPDATE jobs
      SET
        status = 'payment_done'::job_status,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING
        id,
        seeker_user_id,
        category,
        title,
        description,
        location_text,
        visibility,
        location_latitude,
        location_longitude,
        status,
        assigned_provider_user_id,
        accepted_application_id,
        created_at,
        updated_at
      `,
      [input.jobId]
    );

    const internalRecord = this.mapJobRow(updated.rows[0]);
    await this.auditService.logEvent({
      actorUserId: input.actorUserId,
      targetUserId: job.assigned_provider_user_id ?? undefined,
      eventType: "booking_payment_marked_done",
      metadata: {
        jobId: internalRecord.id,
        acceptedApplicationId: internalRecord.acceptedApplicationId
      }
    });
    await this.syncSearchIndex(internalRecord);

    return this.getPublicJobById(internalRecord.id);
  }

  async markPaymentReceived(input: UpdateBookingInput): Promise<JobRecord> {
    assertUuid(input.jobId, "jobId");
    assertUuid(input.actorUserId, "actorUserId");

    const job = await this.getJobOrThrow(input.jobId);
    if (job.status !== "payment_done") {
      throw new BadRequestException("Payment can be received only after owner marks payment done");
    }
    if (!job.assigned_provider_user_id || job.assigned_provider_user_id !== input.actorUserId) {
      throw new BadRequestException("Only assigned provider can mark payment received");
    }

    const updated = await this.databaseService.query<DbJobRow>(
      `
      UPDATE jobs
      SET
        status = 'payment_received'::job_status,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING
        id,
        seeker_user_id,
        category,
        title,
        description,
        location_text,
        visibility,
        location_latitude,
        location_longitude,
        status,
        assigned_provider_user_id,
        accepted_application_id,
        created_at,
        updated_at
      `,
      [input.jobId]
    );

    const internalRecord = this.mapJobRow(updated.rows[0]);
    await this.auditService.logEvent({
      actorUserId: input.actorUserId,
      targetUserId: job.seeker_user_id,
      eventType: "booking_payment_received",
      metadata: {
        jobId: internalRecord.id,
        acceptedApplicationId: internalRecord.acceptedApplicationId
      }
    });
    await this.syncSearchIndex(internalRecord);

    return this.getPublicJobById(internalRecord.id);
  }

  async closeBooking(input: UpdateBookingInput): Promise<JobRecord> {
    assertUuid(input.jobId, "jobId");
    assertUuid(input.actorUserId, "actorUserId");

    const job = await this.getJobOrThrow(input.jobId);
    if (job.status !== "payment_received") {
      throw new BadRequestException("Job can be closed only after payment is received");
    }
    if (job.seeker_user_id !== input.actorUserId) {
      throw new BadRequestException("Only job owner can close this booking");
    }

    const updated = await this.databaseService.query<DbJobRow>(
      `
      UPDATE jobs
      SET
        status = 'closed'::job_status,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING
        id,
        seeker_user_id,
        category,
        title,
        description,
        location_text,
        visibility,
        location_latitude,
        location_longitude,
        status,
        assigned_provider_user_id,
        accepted_application_id,
        created_at,
        updated_at
      `,
      [input.jobId]
    );

    const internalRecord = this.mapJobRow(updated.rows[0]);
    await this.auditService.logEvent({
      actorUserId: input.actorUserId,
      targetUserId: job.assigned_provider_user_id ?? undefined,
      eventType: "booking_closed",
      metadata: {
        jobId: internalRecord.id,
        acceptedApplicationId: internalRecord.acceptedApplicationId
      }
    });
    await this.syncSearchIndex(internalRecord);

    return this.getPublicJobById(internalRecord.id);
  }

  async cancelBooking(input: UpdateBookingInput): Promise<JobRecord> {
    assertUuid(input.jobId, "jobId");
    assertUuid(input.actorUserId, "actorUserId");

    const job = await this.getJobOrThrow(input.jobId);
    if (job.status === "completed") {
      throw new BadRequestException("Completed booking cannot be cancelled");
    }
    if (job.status === "cancelled") {
      return this.getPublicJobById(job.id);
    }
    if (job.status !== "posted" && job.status !== "accepted" && job.status !== "in_progress") {
      throw new BadRequestException("Job cannot be cancelled from current state");
    }

    const canCancel =
      job.seeker_user_id === input.actorUserId ||
      (job.assigned_provider_user_id !== null &&
        job.assigned_provider_user_id === input.actorUserId);
    if (!canCancel) {
      throw new BadRequestException("Actor is not allowed to cancel this booking");
    }

    const updated = await this.databaseService.transaction(async (query) => {
      const cancelledResult = await query<DbJobRow>(
        `
        UPDATE jobs
        SET
          status = 'cancelled'::job_status,
          updated_at = now()
        WHERE id = $1::uuid
        RETURNING
          id,
          seeker_user_id,
          category,
          title,
          description,
          location_text,
          visibility,
          location_latitude,
          location_longitude,
          status,
          assigned_provider_user_id,
          accepted_application_id,
          created_at,
          updated_at
        `,
        [input.jobId]
      );

      if (job.accepted_application_id) {
        const nextApplicationStatus: ApplicationStatus =
          job.assigned_provider_user_id === input.actorUserId ? "withdrawn" : "rejected";
        await query(
          `
          UPDATE job_applications
          SET
            status = $2::application_status,
            updated_at = now()
          WHERE id = $1::uuid
            AND status = 'accepted'::application_status
          `,
          [job.accepted_application_id, nextApplicationStatus]
        );
      }

      return cancelledResult;
    });

    const internalRecord = this.mapJobRow(updated.rows[0]);
    await this.auditService.logEvent({
      actorUserId: input.actorUserId,
      targetUserId:
        job.seeker_user_id === input.actorUserId
          ? job.assigned_provider_user_id ?? undefined
          : job.seeker_user_id,
      eventType: "booking_cancelled",
      metadata: {
        jobId: internalRecord.id,
        acceptedApplicationId: internalRecord.acceptedApplicationId,
        reason: input.reason?.trim() || null
      }
    });
    await this.syncSearchIndex(internalRecord);

    return this.getPublicJobById(internalRecord.id);
  }

  private normalizeSearchInput(input: SearchJobsInput): SearchJobsInput {
    const normalizedQuery = input.q?.trim();
    const normalizedCategory = input.category?.trim();
    const normalizedLocation = input.locationText?.trim();
    const statuses =
      input.statuses?.filter((status): status is JobStatus => Boolean(status)) ?? undefined;

    return {
      q: normalizedQuery && normalizedQuery.length > 0 ? normalizedQuery : undefined,
      category:
        normalizedCategory && normalizedCategory.length > 0
          ? normalizedCategory.toLowerCase()
          : undefined,
      locationText:
        normalizedLocation && normalizedLocation.length > 0 ? normalizedLocation : undefined,
      minSeekerRating: input.minSeekerRating,
      statuses: statuses && statuses.length > 0 ? statuses : undefined,
      visibility: input.visibility,
      latitude: input.latitude,
      longitude: input.longitude,
      radiusKm: input.radiusKm,
      limit: this.clampLimit(input.limit)
    };
  }

  private clampLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit)) {
      return 20;
    }

    const next = Math.trunc(limit ?? 20);
    if (next < 1) {
      return 1;
    }
    if (next > 50) {
      return 50;
    }
    return next;
  }

  private assertGeoInputConsistency(
    latitude: number | undefined,
    longitude: number | undefined,
    radiusKm: number | undefined
  ): void {
    const hasLatitude = typeof latitude === "number";
    const hasLongitude = typeof longitude === "number";
    const hasRadius = typeof radiusKm === "number";
    const providedCount = [hasLatitude, hasLongitude, hasRadius].filter(Boolean).length;

    if (providedCount > 0 && providedCount < 3) {
      throw new BadRequestException(
        "Latitude, longitude, and radiusKm must be provided together for geo search"
      );
    }
  }

  private async searchInDatabase(
    input: SearchJobsInput,
    actorUserId: string,
    preferredIds?: string[]
  ): Promise<JobRecord[]> {
    const searchPattern = input.q ? `%${escapeIlikeLiteral(input.q)}%` : null;
    const categoryPattern = input.category ? `%${escapeIlikeLiteral(input.category)}%` : null;
    const locationPattern = input.locationText ? `%${escapeIlikeLiteral(input.locationText)}%` : null;

    const result = await this.databaseService.query<DbSearchJobRow>(
      `
      SELECT
        j.id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = j.seeker_user_id)), ''), 'member_' || SUBSTRING(md5(j.seeker_user_id::text) FROM 1 FOR 10)) AS seeker_user_id,
        j.category,
        j.title,
        j.description,
        j.location_text,
        j.visibility,
        j.location_latitude,
        j.location_longitude,
        j.status,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = j.assigned_provider_user_id)), ''), 'member_' || SUBSTRING(md5(j.assigned_provider_user_id::text) FROM 1 FOR 10)) AS assigned_provider_user_id,
        j.accepted_application_id,
        j.created_at,
        j.updated_at,
        p.rating_average AS seeker_rating
      FROM jobs j
      LEFT JOIN profiles p ON p.user_id = j.seeker_user_id
      WHERE
        ($1::uuid[] IS NULL OR j.id = ANY($1::uuid[]))
        AND (
          j.seeker_user_id = $2::uuid
          OR j.assigned_provider_user_id = $2::uuid
          OR (
            j.status = 'posted'::job_status
            AND (
              j.visibility = 'public'::job_visibility
              OR (
                j.visibility = 'connections_only'::job_visibility
                AND EXISTS (
                  SELECT 1
                  FROM connections c
                  WHERE c.status = 'accepted'::connection_status
                    AND (
                      (c.user_a_id = $2::uuid AND c.user_b_id = j.seeker_user_id)
                      OR
                      (c.user_b_id = $2::uuid AND c.user_a_id = j.seeker_user_id)
                    )
                )
              )
            )
          )
        )
        AND (
          $3::text IS NULL
          OR (
            j.title ILIKE $3::text
            OR j.description ILIKE $3::text
            OR j.category ILIKE $3::text
            OR j.location_text ILIKE $3::text
          )
        )
        AND ($4::text IS NULL OR j.category ILIKE $4::text)
        AND ($5::text IS NULL OR j.location_text ILIKE $5::text)
        AND ($6::numeric IS NULL OR COALESCE(p.rating_average, 0) >= $6::numeric)
        AND ($7::job_status[] IS NULL OR j.status = ANY($7::job_status[]))
        AND ($8::job_visibility IS NULL OR j.visibility = $8::job_visibility)
        AND (
          $9::double precision IS NULL
          OR (
            j.location_latitude IS NOT NULL
            AND j.location_longitude IS NOT NULL
            AND (
              6371 * acos(
                LEAST(
                  1.0,
                  GREATEST(
                    -1.0,
                    cos(radians($9::double precision))
                    * cos(radians(j.location_latitude))
                    * cos(radians(j.location_longitude) - radians($10::double precision))
                    + sin(radians($9::double precision)) * sin(radians(j.location_latitude))
                  )
                )
              )
            ) <= $11::double precision
          )
        )
      ORDER BY
        CASE
          WHEN $1::uuid[] IS NULL THEN NULL
          ELSE array_position($1::uuid[], j.id)
        END NULLS LAST,
        j.created_at DESC
      LIMIT $12::int
      `,
      [
        preferredIds && preferredIds.length > 0 ? preferredIds : null,
        actorUserId,
        searchPattern,
        categoryPattern,
        locationPattern,
        input.minSeekerRating ?? null,
        input.statuses && input.statuses.length > 0 ? input.statuses : null,
        input.visibility ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.radiusKm ?? null,
        this.clampLimit(input.limit)
      ]
    );

    return result.rows.map((row) => this.mapJobRow(row));
  }

  private async getPublicJobById(jobId: string): Promise<JobRecord> {
    const result = await this.databaseService.query<DbJobRow>(
      `
      SELECT
        j.id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = j.seeker_user_id)), ''), 'member_' || SUBSTRING(md5(j.seeker_user_id::text) FROM 1 FOR 10)) AS seeker_user_id,
        j.category,
        j.title,
        j.description,
        j.location_text,
        j.visibility,
        j.location_latitude,
        j.location_longitude,
        j.status,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = j.assigned_provider_user_id)), ''), 'member_' || SUBSTRING(md5(j.assigned_provider_user_id::text) FROM 1 FOR 10)) AS assigned_provider_user_id,
        j.accepted_application_id,
        j.created_at,
        j.updated_at
      FROM jobs j
      WHERE j.id = $1::uuid
      `,
      [jobId]
    );

    if (!result.rowCount) {
      throw new NotFoundException("Job not found");
    }

    return this.mapJobRow(result.rows[0]);
  }

  private async syncSearchIndex(job: JobRecord): Promise<void> {
    if (!this.jobsSearchService?.isEnabled()) {
      return;
    }

    const payload: SearchIndexedJobInput = {
      id: job.id,
      seekerUserId: job.seekerUserId,
      category: job.category,
      title: job.title,
      description: job.description,
      locationText: job.locationText,
      status: job.status,
      locationLatitude: job.locationLatitude ?? null,
      locationLongitude: job.locationLongitude ?? null,
      seekerRating: null,
      createdAt: job.createdAt
    };

    try {
      await this.jobsSearchService.indexJob(payload);
    } catch (error) {
      console.warn(
        "[JobsService] Search index sync failed for job %s: %s",
        job.id,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async getJobOrThrow(jobId: string): Promise<DbJobRow> {
    const result = await this.databaseService.query<DbJobRow>(
      `
      SELECT
        id,
        seeker_user_id,
        category,
        title,
        description,
        location_text,
        visibility,
        location_latitude,
        location_longitude,
        status,
        assigned_provider_user_id,
        accepted_application_id,
        created_at,
        updated_at
      FROM jobs
      WHERE id = $1::uuid
      `,
      [jobId]
    );

    if (!result.rowCount) {
      throw new NotFoundException("Job not found");
    }

    return result.rows[0];
  }

  private async hasAcceptedConnection(ownerUserId: string, actorUserId: string): Promise<boolean> {
    const result = await this.databaseService.query<{ id: string }>(
      `
      SELECT id
      FROM connections
      WHERE status = 'accepted'::connection_status
        AND (
          (user_a_id = $1::uuid AND user_b_id = $2::uuid)
          OR
          (user_a_id = $2::uuid AND user_b_id = $1::uuid)
        )
      LIMIT 1
      `,
      [ownerUserId, actorUserId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async getApplicationWithJobOrThrow(
    applicationId: string
  ): Promise<DbApplicationWithJobRow> {
    const result = await this.databaseService.query<DbApplicationWithJobRow>(
      `
      SELECT
        a.id,
        a.job_id,
        a.provider_user_id,
        a.status,
        a.message,
        a.created_at,
        a.updated_at,
        j.seeker_user_id,
        j.status AS job_status,
        j.assigned_provider_user_id,
        j.accepted_application_id
      FROM job_applications a
      JOIN jobs j ON j.id = a.job_id
      WHERE a.id = $1::uuid
      `,
      [applicationId]
    );

    if (!result.rowCount) {
      throw new NotFoundException("Job application not found");
    }

    return result.rows[0];
  }

  private mapJobRow(row: DbJobRow): JobRecord {
    return {
      id: row.id,
      seekerUserId: row.seeker_user_id,
      category: row.category,
      title: row.title,
      description: row.description,
      locationText: row.location_text,
      visibility: row.visibility ?? "public",
      locationLatitude: row.location_latitude ?? undefined,
      locationLongitude: row.location_longitude ?? undefined,
      status: row.status,
      assignedProviderUserId: row.assigned_provider_user_id,
      acceptedApplicationId: row.accepted_application_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  private mapApplicationRow(row: DbJobApplicationRow): JobApplicationRecord {
    return {
      id: row.id,
      jobId: row.job_id,
      providerUserId: row.provider_user_id,
      status: row.status,
      message: row.message,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }
}
