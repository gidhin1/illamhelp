import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";

function parseOrigins(originsRaw: string): string[] {
  return originsRaw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

async function bootstrap(): Promise<void> {
  const trustProxy = process.env.TRUST_PROXY === "true";
  const bodyLimitBytes = parsePositiveInt(process.env.BODY_LIMIT_BYTES ?? "1048576", 1048576);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy,
      bodyLimit: bodyLimitBytes
    })
  );

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true
    })
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 4000);
  const nodeEnv = configService.get<string>("NODE_ENV", "development");
  const corsOriginsRaw = configService.get<string>(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
  );
  const corsOrigins = parseOrigins(corsOriginsRaw);
  const strictOriginCheckEnabled =
    configService.get<string>("STRICT_ORIGIN_CHECK", "true") !== "false";
  const authRateWindowMs = parsePositiveInt(
    configService.get<string>("AUTH_RATE_LIMIT_WINDOW_MS", "60000"),
    60000
  );
  const authRateLimitMax = parsePositiveInt(
    configService.get<string>("AUTH_RATE_LIMIT_MAX", "10"),
    10
  );
  const authRateBuckets = new Map<string, { count: number; windowStart: number }>();
  const enableHsts =
    configService.get<string>("ENABLE_HSTS", nodeEnv === "production" ? "true" : "false") ===
    "true";

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : nodeEnv === "production" ? false : true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
    credentials: false
  });

  if (strictOriginCheckEnabled && corsOrigins.length > 0) {
    const allowedOrigins = new Set(corsOrigins);
    app
      .getHttpAdapter()
      .getInstance()
      .addHook("onRequest", (request: any, reply: any, done: () => void) => {
        const originHeader = request.headers?.origin;

        if (typeof originHeader === "string" && !allowedOrigins.has(originHeader)) {
          reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Origin is not allowed"
          });
          return;
        }

        done();
      });
  }

  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", (request: any, reply: any, done: () => void) => {
      const url = request.url ?? "";
      const method = request.method ?? "";
      const isAuthEndpoint =
        method === "POST" &&
        (url.startsWith("/api/v1/auth/login") || url.startsWith("/api/v1/auth/register"));

      if (!isAuthEndpoint) {
        done();
        return;
      }

      const now = Date.now();
      const key = `${request.ip}:${url}`;
      const bucket = authRateBuckets.get(key);

      if (!bucket || now - bucket.windowStart >= authRateWindowMs) {
        authRateBuckets.set(key, { count: 1, windowStart: now });
        if (authRateBuckets.size > 10_000) {
          for (const [bucketKey, entry] of authRateBuckets.entries()) {
            if (now - entry.windowStart >= authRateWindowMs) {
              authRateBuckets.delete(bucketKey);
            }
          }
        }
        done();
        return;
      }

      if (bucket.count >= authRateLimitMax) {
        reply.status(429).send({
          statusCode: 429,
          error: "Too Many Requests",
          message: "Too many authentication attempts. Try again shortly."
        });
        return;
      }

      bucket.count += 1;
      done();
    });

  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onSend", (request: any, reply: any, payload: any, done: (err: Error | null, value?: any) => void) => {
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("X-Frame-Options", "DENY");
      reply.header("Referrer-Policy", "no-referrer");
      reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      reply.header("Cross-Origin-Resource-Policy", "same-site");
      if (enableHsts && request.protocol === "https") {
        reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      }
      done(null, payload);
    });

  const swaggerEnabled =
    configService.get<string>(
      "SWAGGER_ENABLED",
      nodeEnv === "production" ? "false" : "true"
    ) !== "false";
  const swaggerPath = configService.get<string>("SWAGGER_PATH", "api/docs");

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("IllamHelp API")
      .setDescription("IllamHelp backend APIs")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, swaggerDocument, {
      swaggerOptions: {
        persistAuthorization: true
      }
    });
  }

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
