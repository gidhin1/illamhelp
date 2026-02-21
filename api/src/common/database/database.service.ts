import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool, QueryResult, QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(configService: ConfigService) {
    const connectionString =
      configService.get<string>("DATABASE_URL") ??
      this.buildConnectionStringFromParts(configService);
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required (or set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB)"
      );
    }

    this.pool = new Pool({ connectionString });
  }

  query<T extends QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private buildConnectionStringFromParts(
    configService: ConfigService
  ): string | undefined {
    const user = configService.get<string>("POSTGRES_USER");
    const password = configService.get<string>("POSTGRES_PASSWORD");
    const database = configService.get<string>("POSTGRES_DB");
    const host = configService.get<string>("POSTGRES_HOST") ?? "localhost";
    const port = configService.get<number>("POSTGRES_PORT") ?? 5432;

    if (!user || !password || !database) {
      return undefined;
    }

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }
}
