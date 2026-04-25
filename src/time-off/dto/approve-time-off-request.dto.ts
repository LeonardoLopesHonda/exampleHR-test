import { IsString } from 'class-validator';

export class ApproveTimeOffRequestDto {
  @IsString()
  managerId: string;
}
