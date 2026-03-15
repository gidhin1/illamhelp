import { randomUUID } from "node:crypto";

import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { QueryResult, QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import type { AuditService } from "../audit/audit.service";
import { AuthUserService } from "../auth/auth-user.service";
import { KeycloakJwtGuard } from "../auth/guards/keycloak-jwt.guard";
import type { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { JobsService } from "./jobs.service";

const SEEKER_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROVIDER_USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROVIDER_USER_ID = "33333333-3333-4333-8333-333333333333";

const SEEKER_TOKEN = "seeker-token";
const PROVIDER_TOKEN = "provider-token";
const OTHER_PROVIDER_TOKEN = "provider2-token";

type JobStatus =
  | "posted"
  | "accepted"
  | "in_progress"
  | "completed"
  | "payment_done"
  | "payment_received"
  | "closed"
  | "cancelled";
type JobVisibility = "public" | "connections_only";
type ApplicationStatus = "applied" | "shortlisted" | "accepted" | "rejected" | "withdrawn";
type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

interface JobRow {
  id: string;
  seeker_user_id: string;
  category: string;
  title: string;
  description: string;
  location_text: string;
  visibility: JobVisibility;
  location_latitude: number | null;
  location_longitude: number | null;
  status: JobStatus;
  assigned_provider_user_id: string | null;
  accepted_application_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ApplicationRow {
  id: string;
  job_id: string;
  provider_user_id: string;
  status: ApplicationStatus;
  message: string | null;
  skill_snapshot: ServiceSkillSnapshot | null;
  created_at: Date;
  updated_at: Date;
}

interface ServiceSkillSnapshot {
  jobName: string;
  proficiency: string;
  source: string;
}

interface ConnectionRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  requested_by_user_id: string;
  status: ConnectionStatus;
  requested_at: Date;
  decided_at: Date | null;
}

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn()
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({ kid: "test-key" })),
  jwtVerify: jwtVerifyMock
}));

class InMemoryJobsDatabaseService {
  private readonly users = new Map<string, { id: string; role: string; username: string }>();
  private readonly jobs = new Map<string, JobRow>();
  private readonly applications = new Map<string, ApplicationRow>();
  private readonly connections = new Map<string, ConnectionRow>();

  async query<T extends QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const normalized = this.normalizeSql(sql);

    if (normalized.startsWith("insert into users")) {
      const userId = this.readString(params, 0);
      const role = this.readString(params, 1);
      const username = this.readNullableString(params, 2);
      this.users.set(userId, {
        id: userId,
        role,
        username:
          username && username.trim().length > 0
            ? username.trim().toLowerCase()
            : this.toFallbackPublicUserId(userId)
      });
      return this.result<T>([]);
    }

    if (normalized.startsWith("insert into audit_events")) {
      return this.result<T>([]);
    }

    if (normalized.startsWith("insert into jobs")) {
      const row: JobRow = {
        id: randomUUID(),
        seeker_user_id: this.readString(params, 0),
        category: this.readString(params, 1),
        title: this.readString(params, 2),
        description: this.readString(params, 3),
        location_text: this.readString(params, 4),
        visibility: this.readString(params, 5) as JobVisibility,
        location_latitude: this.readNullableNumber(params, 6),
        location_longitude: this.readNullableNumber(params, 7),
        status: "posted",
        assigned_provider_user_id: null,
        accepted_application_id: null,
        created_at: new Date(),
        updated_at: new Date()
      };
      this.jobs.set(row.id, row);
      return this.result<T>([row as unknown as T]);
    }

    if (normalized.includes("from jobs j where j.id = $1::uuid")) {
      const jobId = this.readString(params, 0);
      const row = this.jobs.get(jobId);
      if (!row) {
        return this.result<T>([]);
      }
      return this.result<T>([this.toPublicJobRow(row) as unknown as T]);
    }

    if (normalized.includes("from jobs where id = $1::uuid")) {
      const jobId = this.readString(params, 0);
      const row = this.jobs.get(jobId);
      return row ? this.result<T>([row as unknown as T]) : this.result<T>([]);
    }

    if (normalized.startsWith("select count(*)::text as count from jobs j where")) {
      const actorUserId = this.readString(params, 0);
      const total = [...this.jobs.values()].filter((job) => this.canViewJob(actorUserId, job)).length;
      return this.result<T>([{ count: `${total}` } as unknown as T]);
    }

    if (
      normalized.includes("from jobs") &&
      normalized.includes("order by created_at desc") &&
      normalized.includes("limit $2::int offset $3::int")
    ) {
      const actorUserId = this.readString(params, 0);
      const limit = this.readNullableNumber(params, 1) ?? 50;
      const offset = this.readNullableNumber(params, 2) ?? 0;
      const rows = [...this.jobs.values()]
        .filter((job) => this.canViewJob(actorUserId, job))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(offset, offset + limit);
      if (normalized.includes("coalesce(nullif(trim((select username from users where id = seeker_user_id")) {
        return this.result<T>(rows.map((row) => this.toPublicJobRow(row)) as unknown as T[]);
      }
      return this.result<T>(rows as unknown as T[]);
    }

    if (
      normalized.startsWith("select id from connections") &&
      normalized.includes("where status = 'accepted'::connection_status") &&
      normalized.includes("limit 1")
    ) {
      const ownerUserId = this.readString(params, 0);
      const actorUserId = this.readString(params, 1);
      const connection = [...this.connections.values()].find((item) => {
        if (item.status !== "accepted") {
          return false;
        }
        return (
          (item.user_a_id === ownerUserId && item.user_b_id === actorUserId) ||
          (item.user_a_id === actorUserId && item.user_b_id === ownerUserId)
        );
      });
      if (!connection) {
        return this.result<T>([]);
      }
      return this.result<T>([{ id: connection.id } as unknown as T]);
    }

    if (
      normalized.startsWith("select service_skills, service_categories from profiles") &&
      normalized.includes("where user_id = $1::uuid") &&
      normalized.includes("limit 1")
    ) {
      return this.result<T>([]);
    }

    if (normalized.startsWith("insert into job_applications")) {
      const jobId = this.readString(params, 0);
      const providerUserId = this.readString(params, 1);
      const message = this.readNullableString(params, 2);
      const skillSnapshot = this.readNullableJson<ServiceSkillSnapshot>(params, 3);

      const existing = [...this.applications.values()].find(
        (item) => item.job_id === jobId && item.provider_user_id === providerUserId
      );

      if (!existing) {
        const created: ApplicationRow = {
          id: randomUUID(),
          job_id: jobId,
          provider_user_id: providerUserId,
          status: "applied",
          message,
          skill_snapshot: skillSnapshot,
          created_at: new Date(),
          updated_at: new Date()
        };
        this.applications.set(created.id, created);
        if (normalized.includes("coalesce(nullif(trim((select username from users where id = provider_user_id")) {
          return this.result<T>([this.toPublicApplicationRow(created) as unknown as T]);
        }
        return this.result<T>([created as unknown as T]);
      }

      if (existing.status === "withdrawn") {
        existing.status = "applied";
        existing.message = message;
        existing.skill_snapshot = skillSnapshot;
        existing.updated_at = new Date();
        this.applications.set(existing.id, existing);
        if (normalized.includes("coalesce(nullif(trim((select username from users where id = provider_user_id")) {
          return this.result<T>([this.toPublicApplicationRow(existing) as unknown as T]);
        }
        return this.result<T>([existing as unknown as T]);
      }

      return this.result<T>([]);
    }

    if (
      normalized.includes("from job_applications") &&
      normalized.includes("where job_id = $1::uuid")
    ) {
      const jobId = this.readString(params, 0);
      const isOwner = Boolean(params[1]);
      const actorUserId = this.readString(params, 2);

      const rows = [...this.applications.values()]
        .filter((item) => item.job_id === jobId)
        .filter((item) => isOwner || item.provider_user_id === actorUserId)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

      if (normalized.includes("coalesce(nullif(trim((select username from users where id = provider_user_id")) {
        return this.result<T>(rows.map((item) => this.toPublicApplicationRow(item)) as unknown as T[]);
      }
      return this.result<T>(rows as unknown as T[]);
    }

    if (
      normalized.includes("from job_applications") &&
      normalized.includes("where provider_user_id = $1::uuid")
    ) {
      const providerUserId = this.readString(params, 0);
      const rows = [...this.applications.values()]
        .filter((item) => item.provider_user_id === providerUserId)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      if (normalized.includes("coalesce(nullif(trim((select username from users where id = provider_user_id")) {
        return this.result<T>(rows.map((item) => this.toPublicApplicationRow(item)) as unknown as T[]);
      }
      return this.result<T>(rows as unknown as T[]);
    }

    if (
      normalized.startsWith("select a.id, a.job_id, a.provider_user_id, a.status, a.message, a.skill_snapshot, a.created_at, a.updated_at") &&
      normalized.includes("from job_applications a join jobs j on j.id = a.job_id")
    ) {
      const applicationId = this.readString(params, 0);
      const app = this.applications.get(applicationId);
      if (!app) {
        return this.result<T>([]);
      }
      const job = this.jobs.get(app.job_id);
      if (!job) {
        return this.result<T>([]);
      }

      return this.result<T>([
        {
          ...app,
          seeker_user_id: job.seeker_user_id,
          job_status: job.status,
          assigned_provider_user_id: job.assigned_provider_user_id,
          accepted_application_id: job.accepted_application_id
        } as unknown as T
      ]);
    }

    if (
      normalized.includes("from job_applications") &&
      normalized.includes("where id = $1::uuid")
    ) {
      const applicationId = this.readString(params, 0);
      const app = this.applications.get(applicationId);
      if (!app) {
        return this.result<T>([]);
      }
      return this.result<T>([this.toPublicApplicationRow(app) as unknown as T]);
    }

    if (
      normalized.startsWith("update job_applications") &&
      normalized.includes("set status = 'accepted'::application_status")
    ) {
      const applicationId = this.readString(params, 0);
      const app = this.getApplication(applicationId);
      app.status = "accepted";
      app.updated_at = new Date();
      this.applications.set(app.id, app);
      if (normalized.includes("coalesce(nullif(trim((select username from users where id = provider_user_id")) {
        return this.result<T>([this.toPublicApplicationRow(app) as unknown as T]);
      }
      return this.result<T>([app as unknown as T]);
    }

    if (
      normalized.startsWith("update job_applications") &&
      normalized.includes("set status = 'rejected'::application_status") &&
      normalized.includes("where job_id = $1::uuid")
    ) {
      const jobId = this.readString(params, 0);
      const acceptedId = this.readString(params, 1);
      let count = 0;
      for (const app of this.applications.values()) {
        if (
          app.job_id === jobId &&
          app.id !== acceptedId &&
          (app.status === "applied" || app.status === "shortlisted")
        ) {
          app.status = "rejected";
          app.updated_at = new Date();
          this.applications.set(app.id, app);
          count += 1;
        }
      }
      return this.result<T>([], count);
    }

    if (
      normalized.startsWith("update jobs") &&
      normalized.includes("set status = 'accepted'::job_status")
    ) {
      const jobId = this.readString(params, 0);
      const providerId = this.readString(params, 1);
      const applicationId = this.readString(params, 2);
      const job = this.jobs.get(jobId);
      if (!job || job.status !== "posted") {
        return this.result<T>([], 0);
      }
      job.status = "accepted";
      job.assigned_provider_user_id = providerId;
      job.accepted_application_id = applicationId;
      job.updated_at = new Date();
      this.jobs.set(job.id, job);
      return this.result<T>([], 1);
    }

    if (
      normalized.startsWith("update job_applications") &&
      normalized.includes("set status = 'rejected'::application_status") &&
      normalized.includes("where id = $1::uuid")
    ) {
      const applicationId = this.readString(params, 0);
      const app = this.getApplication(applicationId);
      app.status = "rejected";
      app.updated_at = new Date();
      this.applications.set(app.id, app);
      if (normalized.includes("coalesce(nullif(trim((select username from users where id = provider_user_id")) {
        return this.result<T>([this.toPublicApplicationRow(app) as unknown as T]);
      }
      return this.result<T>([app as unknown as T]);
    }

    if (
      normalized.startsWith("update job_applications") &&
      normalized.includes("set status = 'withdrawn'::application_status")
    ) {
      const applicationId = this.readString(params, 0);
      const app = this.getApplication(applicationId);
      app.status = "withdrawn";
      app.updated_at = new Date();
      this.applications.set(app.id, app);
      if (normalized.includes("coalesce(nullif(trim((select username from users where id = provider_user_id")) {
        return this.result<T>([this.toPublicApplicationRow(app) as unknown as T]);
      }
      return this.result<T>([app as unknown as T]);
    }

    if (
      normalized.startsWith("update jobs") &&
      normalized.includes("set status = 'in_progress'::job_status")
    ) {
      const jobId = this.readString(params, 0);
      const job = this.getJob(jobId);
      job.status = "in_progress";
      job.updated_at = new Date();
      this.jobs.set(job.id, job);
      return this.result<T>([job as unknown as T]);
    }

    if (
      normalized.startsWith("update jobs") &&
      normalized.includes("set status = 'completed'::job_status")
    ) {
      const jobId = this.readString(params, 0);
      const job = this.getJob(jobId);
      job.status = "completed";
      job.updated_at = new Date();
      this.jobs.set(job.id, job);
      return this.result<T>([job as unknown as T]);
    }

    if (
      normalized.startsWith("update jobs") &&
      normalized.includes("set status = 'payment_done'::job_status")
    ) {
      const jobId = this.readString(params, 0);
      const job = this.getJob(jobId);
      job.status = "payment_done";
      job.updated_at = new Date();
      this.jobs.set(job.id, job);
      return this.result<T>([job as unknown as T]);
    }

    if (
      normalized.startsWith("update jobs") &&
      normalized.includes("set status = 'payment_received'::job_status")
    ) {
      const jobId = this.readString(params, 0);
      const job = this.getJob(jobId);
      job.status = "payment_received";
      job.updated_at = new Date();
      this.jobs.set(job.id, job);
      return this.result<T>([job as unknown as T]);
    }

    if (
      normalized.startsWith("update jobs") &&
      normalized.includes("set status = 'closed'::job_status")
    ) {
      const jobId = this.readString(params, 0);
      const job = this.getJob(jobId);
      job.status = "closed";
      job.updated_at = new Date();
      this.jobs.set(job.id, job);
      return this.result<T>([job as unknown as T]);
    }

    if (
      normalized.startsWith("update jobs") &&
      normalized.includes("set status = 'cancelled'::job_status")
    ) {
      const jobId = this.readString(params, 0);
      const job = this.getJob(jobId);
      job.status = "cancelled";
      job.updated_at = new Date();
      this.jobs.set(job.id, job);
      return this.result<T>([job as unknown as T]);
    }

    if (
      normalized.startsWith("update job_applications") &&
      normalized.includes("set status = $2::application_status")
    ) {
      const applicationId = this.readString(params, 0);
      const status = this.readString(params, 1) as ApplicationStatus;
      const app = this.getApplication(applicationId);
      if (app.status !== "accepted") {
        return this.result<T>([], 0);
      }
      app.status = status;
      app.updated_at = new Date();
      this.applications.set(app.id, app);
      return this.result<T>([], 1);
    }

    throw new Error(`Unhandled SQL in jobs integration test DB: ${normalized}`);
  }

  async transaction<T>(
    callback: <R extends QueryResultRow>(query: (sql: string, params?: unknown[]) => Promise<QueryResult<R>>) => Promise<T>
  ): Promise<T> {
    // In-memory mock: no actual transaction needed, just delegate to this.query
    return callback(<R extends QueryResultRow>(sql: string, params: unknown[] = []) =>
      this.query<R>(sql, params)
    );
  }

  private normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, " ").trim().toLowerCase();
  }

  private result<T extends QueryResultRow>(rows: T[], rowCount = rows.length): QueryResult<T> {
    return {
      command: "SELECT",
      rowCount,
      oid: 0,
      fields: [],
      rows
    } as QueryResult<T>;
  }

  private readString(values: unknown[], index: number): string {
    const value = values[index];
    if (typeof value !== "string") {
      throw new Error(`Expected string at params[${index}]`);
    }
    return value;
  }

  private readNullableString(values: unknown[], index: number): string | null {
    const value = values[index];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new Error(`Expected nullable string at params[${index}]`);
    }
    return value;
  }

  private readNullableNumber(values: unknown[], index: number): number | null {
    const value = values[index];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`Expected nullable number at params[${index}]`);
    }
    return value;
  }

  private readNullableJson<T>(values: unknown[], index: number): T | null {
    const value = values[index];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new Error(`Expected nullable JSON string at params[${index}]`);
    }
    return JSON.parse(value) as T;
  }

  private getJob(jobId: string): JobRow {
    const row = this.jobs.get(jobId);
    if (!row) {
      throw new Error(`Job not found in test DB: ${jobId}`);
    }
    return row;
  }

  private getApplication(applicationId: string): ApplicationRow {
    const row = this.applications.get(applicationId);
    if (!row) {
      throw new Error(`Application not found in test DB: ${applicationId}`);
    }
    return row;
  }

  seedAcceptedConnection(leftUserId: string, rightUserId: string): string {
    const [userAId, userBId] = [leftUserId, rightUserId].sort();
    const existing = [...this.connections.values()].find(
      (item) => item.user_a_id === userAId && item.user_b_id === userBId
    );
    if (existing) {
      existing.status = "accepted";
      existing.decided_at = new Date();
      this.connections.set(existing.id, existing);
      return existing.id;
    }

    const connectionId = randomUUID();
    this.connections.set(connectionId, {
      id: connectionId,
      user_a_id: userAId,
      user_b_id: userBId,
      requested_by_user_id: leftUserId,
      status: "accepted",
      requested_at: new Date(),
      decided_at: new Date()
    });
    return connectionId;
  }

  private toFallbackPublicUserId(userId: string): string {
    return `member_${userId.replace(/-/g, "").slice(0, 10).toLowerCase()}`;
  }

  private toPublicUserId(userId: string | null): string | null {
    if (!userId) {
      return null;
    }
    const user = this.users.get(userId);
    if (!user) {
      return this.toFallbackPublicUserId(userId);
    }
    return user.username;
  }

  private toPublicJobRow(row: JobRow): JobRow {
    return {
      ...row,
      seeker_user_id: this.toPublicUserId(row.seeker_user_id) ?? this.toFallbackPublicUserId(row.seeker_user_id),
      assigned_provider_user_id: this.toPublicUserId(row.assigned_provider_user_id)
    };
  }

  private toPublicApplicationRow(row: ApplicationRow): ApplicationRow {
    return {
      ...row,
      provider_user_id:
        this.toPublicUserId(row.provider_user_id) ??
        this.toFallbackPublicUserId(row.provider_user_id)
    };
  }

  private hasAcceptedConnection(actorUserId: string, ownerUserId: string): boolean {
    return [...this.connections.values()].some(
      (item) =>
        item.status === "accepted" &&
        ((item.user_a_id === ownerUserId && item.user_b_id === actorUserId) ||
          (item.user_a_id === actorUserId && item.user_b_id === ownerUserId))
    );
  }

  private canViewJob(actorUserId: string, job: JobRow): boolean {
    if (job.seeker_user_id === actorUserId) {
      return true;
    }
    if (job.assigned_provider_user_id === actorUserId) {
      return true;
    }
    if (job.status !== "posted") {
      return false;
    }
    if (job.visibility === "public") {
      return true;
    }
    return this.hasAcceptedConnection(actorUserId, job.seeker_user_id);
  }
}

function buildExecutionContext(
  request: { headers: Record<string, string | undefined>; user?: AuthenticatedUser }
): ExecutionContext {
  const handler = function testHandler(): void {
    // no-op
  };
  class TestController { }

  return {
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: () => handler,
    getClass: () => TestController
  } as unknown as ExecutionContext;
}

describe("Auth + Jobs applications/booking integration", () => {
  let db: InMemoryJobsDatabaseService;
  let guard: KeycloakJwtGuard;
  let jobsService: JobsService;

  beforeEach(() => {
    jwtVerifyMock.mockReset();
    jwtVerifyMock.mockImplementation(async (token: string) => {
      if (token === SEEKER_TOKEN) {
        return {
          payload: {
            sub: SEEKER_USER_ID,
            aud: "illamhelp-api",
            azp: "illamhelp-api",
            realm_access: { roles: ["seeker"] }
          }
        };
      }

      if (token === PROVIDER_TOKEN) {
        return {
          payload: {
            sub: PROVIDER_USER_ID,
            aud: "illamhelp-api",
            azp: "illamhelp-api",
            realm_access: { roles: ["provider"] }
          }
        };
      }

      if (token === OTHER_PROVIDER_TOKEN) {
        return {
          payload: {
            sub: OTHER_PROVIDER_USER_ID,
            aud: "illamhelp-api",
            azp: "illamhelp-api",
            realm_access: { roles: ["provider"] }
          }
        };
      }

      throw new UnauthorizedException("Invalid token");
    });

    db = new InMemoryJobsDatabaseService();
    const databaseService = db as unknown as DatabaseService;
    jobsService = new JobsService(
      databaseService,
      {
        logEvent: vi.fn().mockResolvedValue(undefined)
      } as unknown as AuditService,
      {
        create: vi.fn().mockResolvedValue({ id: "mock-notification" })
      } as any
    );
    const authUserService = new AuthUserService(databaseService);

    const configService: Pick<ConfigService, "get"> = {
      get<T>(propertyPath: string, defaultValue?: T): T {
        const values: Record<string, unknown> = {
          KEYCLOAK_URL: "http://localhost:8080",
          KEYCLOAK_REALM: "illamhelp",
          KEYCLOAK_CLIENT_ID: "illamhelp-api"
        };
        return (values[propertyPath] as T) ?? (defaultValue as T);
      }
    };

    guard = new KeycloakJwtGuard(
      configService as ConfigService,
      new Reflector(),
      authUserService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs apply -> accept -> start -> complete flow", async () => {
    const seeker = await authenticate(guard, SEEKER_TOKEN);
    const provider = await authenticate(guard, PROVIDER_TOKEN);

    const job = await jobsService.create({
      seekerUserId: seeker.userId,
      category: "plumber",
      title: "Kitchen sink leak",
      description: "Need same-day plumbing support",
      locationText: "Kakkanad, Kochi",
      visibility: "public"
    });
    expect(job.status).toBe("posted");
    expect(job.seekerUserId).toBe(seeker.publicUserId);

    const applied = await jobsService.apply({
      jobId: job.id,
      providerUserId: provider.userId,
      message: "Available immediately"
    });
    expect(applied.status).toBe("applied");
    expect(applied.providerUserId).toBe(provider.publicUserId);

    const ownerVisibleApplications = await jobsService.listApplications(job.id, seeker.userId);
    expect(ownerVisibleApplications.length).toBe(1);
    expect(ownerVisibleApplications[0].providerUserId).toBe(provider.publicUserId);

    const myApplications = await jobsService.listMyApplications(provider.userId);
    expect(myApplications.length).toBe(1);
    expect(myApplications[0].providerUserId).toBe(provider.publicUserId);

    const accepted = await jobsService.acceptApplication({
      applicationId: applied.id,
      seekerUserId: seeker.userId
    });
    expect(accepted.status).toBe("accepted");

    const inProgress = await jobsService.startBooking({
      jobId: job.id,
      actorUserId: provider.userId
    });
    expect(inProgress.status).toBe("in_progress");
    expect(inProgress.assignedProviderUserId).toBe(provider.publicUserId);

    const completed = await jobsService.completeBooking({
      jobId: job.id,
      actorUserId: seeker.userId
    });
    expect(completed.status).toBe("completed");
    expect(completed.assignedProviderUserId).toBe(provider.publicUserId);
  });

  it("prevents non-owner from accepting applications", async () => {
    const seeker = await authenticate(guard, SEEKER_TOKEN);
    const provider = await authenticate(guard, PROVIDER_TOKEN);
    const otherProvider = await authenticate(guard, OTHER_PROVIDER_TOKEN);

    const job = await jobsService.create({
      seekerUserId: seeker.userId,
      category: "electrician",
      title: "Switchboard issue",
      description: "Need electrician for intermittent power issue",
      locationText: "Chennai, Velachery",
      visibility: "public"
    });

    const applied = await jobsService.apply({
      jobId: job.id,
      providerUserId: provider.userId,
      message: "Can visit this evening"
    });

    await expect(
      jobsService.acceptApplication({
        applicationId: applied.id,
        seekerUserId: otherProvider.userId
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks withdrawal after acceptance", async () => {
    const seeker = await authenticate(guard, SEEKER_TOKEN);
    const provider = await authenticate(guard, PROVIDER_TOKEN);

    const job = await jobsService.create({
      seekerUserId: seeker.userId,
      category: "carpenter",
      title: "Wardrobe hinge repair",
      description: "Need repair for broken wardrobe hinge",
      locationText: "Coimbatore, Gandhipuram",
      visibility: "public"
    });

    const applied = await jobsService.apply({
      jobId: job.id,
      providerUserId: provider.userId,
      message: "Experienced with custom furniture"
    });

    await jobsService.acceptApplication({
      applicationId: applied.id,
      seekerUserId: seeker.userId
    });

    await expect(
      jobsService.withdrawApplication({
        applicationId: applied.id,
        providerUserId: provider.userId
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enforces connections_only visibility for job applications", async () => {
    const seeker = await authenticate(guard, SEEKER_TOKEN);
    const provider = await authenticate(guard, PROVIDER_TOKEN);

    const job = await jobsService.create({
      seekerUserId: seeker.userId,
      category: "plumber",
      title: "Pipe leak near meter",
      description: "Need urgent pipe leak repair support",
      locationText: "Kochi, Kakkanad",
      visibility: "connections_only"
    });

    await expect(
      jobsService.apply({
        jobId: job.id,
        providerUserId: provider.userId,
        message: "Can visit now"
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    db.seedAcceptedConnection(seeker.userId, provider.userId);

    const applied = await jobsService.apply({
      jobId: job.id,
      providerUserId: provider.userId,
      message: "Can visit now"
    });
    expect(applied.status).toBe("applied");
  });

  it("runs payment lifecycle from completed to closed with actor checks", async () => {
    const seeker = await authenticate(guard, SEEKER_TOKEN);
    const provider = await authenticate(guard, PROVIDER_TOKEN);

    const job = await jobsService.create({
      seekerUserId: seeker.userId,
      category: "electrician",
      title: "Main switch issue",
      description: "Need repair for repeated tripping in main panel",
      locationText: "Chennai, Velachery",
      visibility: "public"
    });

    const applied = await jobsService.apply({
      jobId: job.id,
      providerUserId: provider.userId,
      message: "Available tonight"
    });
    await jobsService.acceptApplication({
      applicationId: applied.id,
      seekerUserId: seeker.userId
    });
    await jobsService.startBooking({
      jobId: job.id,
      actorUserId: provider.userId
    });
    await jobsService.completeBooking({
      jobId: job.id,
      actorUserId: seeker.userId
    });

    const paymentDone = await jobsService.markPaymentDone({
      jobId: job.id,
      actorUserId: seeker.userId
    });
    expect(paymentDone.status).toBe("payment_done");

    await expect(
      jobsService.markPaymentReceived({
        jobId: job.id,
        actorUserId: seeker.userId
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    const paymentReceived = await jobsService.markPaymentReceived({
      jobId: job.id,
      actorUserId: provider.userId
    });
    expect(paymentReceived.status).toBe("payment_received");

    await expect(
      jobsService.closeBooking({
        jobId: job.id,
        actorUserId: provider.userId
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    const closed = await jobsService.closeBooking({
      jobId: job.id,
      actorUserId: seeker.userId
    });
    expect(closed.status).toBe("closed");
  });
});

async function authenticate(
  guard: KeycloakJwtGuard,
  token: string
): Promise<AuthenticatedUser> {
  const request: { headers: Record<string, string | undefined>; user?: AuthenticatedUser } = {
    headers: {
      authorization: `Bearer ${token}`
    }
  };

  const context = buildExecutionContext(request);
  const activated = await guard.canActivate(context);
  expect(activated).toBe(true);
  expect(request.user).toBeDefined();
  return request.user as AuthenticatedUser;
}
