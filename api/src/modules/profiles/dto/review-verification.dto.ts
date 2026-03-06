import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewVerificationDto {
    @IsString()
    @IsNotEmpty()
    @IsIn(["approved", "rejected"])
    decision!: "approved" | "rejected";

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    notes?: string;
}
