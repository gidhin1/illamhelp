import type {
  ExecutionContext
} from "@nestjs/common";
import {
  UnauthorizedException,
  createParamDecorator
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import type { AuthenticatedUser } from "../interfaces/authenticated-user.interface";

interface RequestWithUser extends FastifyRequest {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException("Authenticated user context missing");
    }

    return request.user;
  }
);
