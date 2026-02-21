import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true })
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
