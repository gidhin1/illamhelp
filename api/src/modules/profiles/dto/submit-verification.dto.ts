import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class SubmitVerificationDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    documentType!: string;

    @IsArray()
    @IsString({ each: true })
    documentMediaIds!: string[];

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;
}
