import { IsOptional, IsString } from 'class-validator';

export class RejectTimeOffRequestDto {
  @IsString()
  managerId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
