import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool, QueryResult, QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private closePromise: Promise<void> | null = null;

  constructor(configService: ConfigService) {
    const connectionString =
      configService.get<string>("DATABASE_URL") ??
      this.buildConnectionStringFromParts(configService);
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required (or set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB)"
      );
    }

    this.pool = new Pool({
      connectionString,
      max: parseInt(configService.get<string>("DB_POOL_MAX", "20"), 10),
      idleTimeoutMillis: parseInt(configService.get<string>("DB_POOL_IDLE_TIMEOUT_MS", "30000"), 10),
      connectionTimeoutMillis: parseInt(configService.get<string>("DB_POOL_CONNECT_TIMEOUT_MS", "5000"), 10),
      statement_timeout: parseInt(configService.get<string>("DB_STATEMENT_TIMEOUT_MS", "30000"), 10)
    });
  }

  query<T extends QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  /**
   * Execute a callback inside a database transaction.
   * Acquires a dedicated client, runs BEGIN, calls the callback,
   * then COMMIT on success or ROLLBACK on error.
   */
  async transaction<T>(
    callback: (query: <R extends QueryResultRow>(sql: string, params?: unknown[]) => Promise<QueryResult<R>>) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(<R extends QueryResultRow>(sql: string, params: unknown[] = []) =>
        client.query<R>(sql, params)
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.closePromise) {
      this.closePromise = this.pool.end().catch((error: unknown) => {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("called end on pool more than once")) {
          return;
        }
        throw error;
      });
    }
    await this.closePromise;
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
