import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { ROLES_KEY } from "../decorators/roles.decorator";
import type {
  AppRole,
  AuthenticatedUser
} from "../interfaces/authenticated-user.interface";

interface RequestWithUser extends FastifyRequest {
  user?: AuthenticatedUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException("Authenticated user context missing");
    }

    const hasRole = requiredRoles.some((role) => request.user?.roles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException("Insufficient role for this operation");
    }

    return true;
  }
}
