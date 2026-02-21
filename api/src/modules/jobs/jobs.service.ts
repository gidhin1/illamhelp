import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";

type JobStatus = "posted" | "accepted" | "in_progress" | "completed" | "cancelled";

export interface CreateJobInput {
  seekerUserId: string;
  category: string;
  title: string;
  description: string;
  locationText: string;
}

export interface JobRecord extends CreateJobInput {
  id: string;
  status: JobStatus;
  createdAt: string;
}

interface DbJobRow {
  id: string;
  seeker_user_id: string;
  category: string;
  title: string;
  description: string;
  location_text: string;
  status: JobStatus;
  created_at: Date;
}

@Injectable()
export class JobsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(input: CreateJobInput): Promise<JobRecord> {
    assertUuid(input.seekerUserId, "seekerUserId");

    const result = await this.databaseService.query<DbJobRow>(
      `
      INSERT INTO jobs (
        seeker_user_id,
        category,
        title,
        description,
        location_text
      )
      VALUES ($1::uuid, $2, $3, $4, $5)
      RETURNING id, seeker_user_id, category, title, description, location_text, status, created_at
      `,
      [
        input.seekerUserId,
        input.category,
        input.title,
        input.description,
        input.locationText
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async list(): Promise<JobRecord[]> {
    const result = await this.databaseService.query<DbJobRow>(
      `
      SELECT id, seeker_user_id, category, title, description, location_text, status, created_at
      FROM jobs
      ORDER BY created_at DESC
      `
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: DbJobRow): JobRecord {
    return {
      id: row.id,
      seekerUserId: row.seeker_user_id,
      category: row.category,
      title: row.title,
      description: row.description,
      locationText: row.location_text,
      status: row.status,
      createdAt: row.created_at.toISOString()
    };
  }
}
