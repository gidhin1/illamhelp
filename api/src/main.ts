import type { FastifyReply, FastifyRequest } from "fastify";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import compress from "@fastify/compress";

import { AppModule } from "./app.module";
import { SlidingWindowRateLimiter } from "./common/security/sliding-window-rate-limiter";

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

function getSingleHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const value = headers[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

interface EndpointRateLimitRule {
  id: string;
  method: string;
  pathPattern: RegExp;
  windowMs: number;
  max: number;
  message: string;
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
    [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://localhost:3002",
      "http://127.0.0.1:3002",
      "http://localhost:3003",
      "http://127.0.0.1:3003"
    ].join(",")
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
  const jobsWriteRateLimitWindowMs = parsePositiveInt(
    configService.get<string>("JOBS_WRITE_RATE_LIMIT_WINDOW_MS", "60000"),
    60000
  );
  const jobsWriteRateLimitMax = parsePositiveInt(
    configService.get<string>("JOBS_WRITE_RATE_LIMIT_MAX", "30"),
    30
  );
  const connectionsWriteRateLimitWindowMs = parsePositiveInt(
    configService.get<string>("CONNECTIONS_WRITE_RATE_LIMIT_WINDOW_MS", "60000"),
    60000
  );
  const connectionsWriteRateLimitMax = parsePositiveInt(
    configService.get<string>("CONNECTIONS_WRITE_RATE_LIMIT_MAX", "30"),
    30
  );
  const consentWriteRateLimitWindowMs = parsePositiveInt(
    configService.get<string>("CONSENT_WRITE_RATE_LIMIT_WINDOW_MS", "60000"),
    60000
  );
  const consentWriteRateLimitMax = parsePositiveInt(
    configService.get<string>("CONSENT_WRITE_RATE_LIMIT_MAX", "30"),
    30
  );
  const mediaWriteRateLimitWindowMs = parsePositiveInt(
    configService.get<string>("MEDIA_WRITE_RATE_LIMIT_WINDOW_MS", "60000"),
    60000
  );
  const mediaWriteRateLimitMax = parsePositiveInt(
    configService.get<string>("MEDIA_WRITE_RATE_LIMIT_MAX", "20"),
    20
  );
  const searchRateLimitWindowMs = parsePositiveInt(
    configService.get<string>("SEARCH_RATE_LIMIT_WINDOW_MS", "60000"),
    60000
  );
  const searchRateLimitMax = parsePositiveInt(
    configService.get<string>("SEARCH_RATE_LIMIT_MAX", "120"),
    120
  );
  const endpointRateLimiter = new SlidingWindowRateLimiter(50_000);
  const endpointRateLimitRules: EndpointRateLimitRule[] = [
    {
      id: "auth-login",
      method: "POST",
      pathPattern: /^\/api\/v1\/auth\/login$/,
      windowMs: authRateWindowMs,
      max: authRateLimitMax,
      message: "Too many authentication attempts. Try again shortly."
    },
    {
      id: "auth-register",
      method: "POST",
      pathPattern: /^\/api\/v1\/auth\/register$/,
      windowMs: authRateWindowMs,
      max: authRateLimitMax,
      message: "Too many authentication attempts. Try again shortly."
    },
    {
      id: "jobs-write",
      method: "POST",
      pathPattern:
        /^\/api\/v1\/jobs(?:$|\/[^/]+\/apply$|\/[^/]+\/booking\/(?:start|complete|payment-done|payment-received|close|cancel)$|\/applications\/[^/]+\/(?:accept|reject|withdraw)$)/,
      windowMs: jobsWriteRateLimitWindowMs,
      max: jobsWriteRateLimitMax,
      message: "Too many job write operations. Please slow down and try again."
    },
    {
      id: "connections-write",
      method: "POST",
      pathPattern: /^\/api\/v1\/connections\/(?:request|[^/]+\/(?:accept|decline|block))$/,
      windowMs: connectionsWriteRateLimitWindowMs,
      max: connectionsWriteRateLimitMax,
      message: "Too many connection actions. Please try again shortly."
    },
    {
      id: "consent-write",
      method: "POST",
      pathPattern: /^\/api\/v1\/consent\/(?:request-access|[^/]+\/(?:grant|revoke))$/,
      windowMs: consentWriteRateLimitWindowMs,
      max: consentWriteRateLimitMax,
      message: "Too many consent actions. Please try again shortly."
    },
    {
      id: "media-write",
      method: "POST",
      pathPattern: /^\/api\/v1\/media\/(?:upload-ticket|[^/]+\/complete)$/,
      windowMs: mediaWriteRateLimitWindowMs,
      max: mediaWriteRateLimitMax,
      message: "Too many media upload actions. Please try again shortly."
    },
    {
      id: "search-read",
      method: "GET",
      pathPattern: /^\/api\/v1\/(?:jobs\/search|connections\/search)$/,
      windowMs: searchRateLimitWindowMs,
      max: searchRateLimitMax,
      message: "Too many search requests. Please try again shortly."
    },
    {
      id: "media-public-read",
      method: "GET",
      pathPattern: /^\/api\/v1\/media\/public\/[^/]+$/,
      windowMs: searchRateLimitWindowMs,
      max: searchRateLimitMax,
      message: "Too many media requests. Please try again shortly."
    }
  ];
  const enableHsts =
    configService.get<string>("ENABLE_HSTS", nodeEnv === "production" ? "true" : "false") ===
    "true";

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : nodeEnv === "production" ? false : true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
    credentials: false
  });
  const fastify = app.getHttpAdapter().getInstance();

  await fastify.register(compress, { global: true });

  if (strictOriginCheckEnabled && corsOrigins.length > 0) {
    const allowedOrigins = new Set(corsOrigins);
    fastify.addHook(
      "onRequest",
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const originHeader = getSingleHeaderValue(
          request.headers as Record<string, string | string[] | undefined>,
          "origin"
        );

        if (typeof originHeader === "string" && !allowedOrigins.has(originHeader)) {
          reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Origin is not allowed"
          });
        }
      }
    );
  }

  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const path = (request.url ?? "").split("?", 1)[0] ?? "";
      const method = request.method ?? "";

      for (const rule of endpointRateLimitRules) {
        if (rule.method !== method || !rule.pathPattern.test(path)) {
          continue;
        }

        const key = `${rule.id}:${request.ip}`;
        const decision = endpointRateLimiter.consume(key, rule.windowMs, rule.max);
        reply.header("X-RateLimit-Limit", String(rule.max));
        reply.header("X-RateLimit-Remaining", String(decision.remaining));
        reply.header(
          "X-RateLimit-Reset",
          String(Math.ceil(decision.resetAtEpochMs / 1000))
        );

        if (!decision.allowed) {
          reply.header("Retry-After", String(decision.retryAfterSeconds));
          reply.status(429).send({
            statusCode: 429,
            error: "Too Many Requests",
            message: rule.message
          });
        }
        return;
      }
    }
  );

  fastify.addHook(
    "onSend",
    async (
      request: FastifyRequest,
      reply: FastifyReply,
      payload: unknown
    ): Promise<unknown> => {
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("X-Frame-Options", "DENY");
      reply.header("Referrer-Policy", "no-referrer");
      reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      reply.header("Cross-Origin-Resource-Policy", "same-site");
      if (enableHsts && request.protocol === "https") {
        reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      }
      return payload;
    }
  );

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

  app.enableShutdownHooks();

  const shutdownTimeoutMs = parsePositiveInt(
    configService.get<string>("SHUTDOWN_TIMEOUT_MS", "10000"),
    10000
  );

  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
  for (const signal of signals) {
    process.on(signal, () => {
      console.log(`[bootstrap] Received ${signal}, draining connections (${shutdownTimeoutMs}ms)...`);
      setTimeout(async () => {
        try {
          await app.close();
          console.log("[bootstrap] Graceful shutdown complete.");
        } catch (error) {
          console.error("[bootstrap] Error during shutdown:", error);
        } finally {
          process.exit(0);
        }
      }, shutdownTimeoutMs);
    });
  }

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
