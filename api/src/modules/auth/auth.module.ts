import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { AuthUserService } from "./auth-user.service";
import { KeycloakJwtGuard } from "./guards/keycloak-jwt.guard";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthUserService,
    {
      provide: APP_GUARD,
      useClass: KeycloakJwtGuard
    }
  ],
  exports: [AuthService, AuthUserService]
})
export class AuthModule {}
