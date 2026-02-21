import { IsUUID } from "class-validator";

export class RequestConnectionDto {
  @IsUUID()
  targetUserId!: string;
}
