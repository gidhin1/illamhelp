import type { UserType } from "./user-type.enum";

export type AppRole = "both" | "seeker" | "provider" | "admin" | "support";

export interface AuthenticatedUser {
  userId: string;
  roles: AppRole[];
  userType: UserType;
  tokenSubject: string;
}
