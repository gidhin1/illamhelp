import { SetMetadata } from "@nestjs/common";

import type { AppRole } from "../interfaces/authenticated-user.interface";

export const ROLES_KEY = "auth:roles";
export const Roles = (...roles: AppRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
