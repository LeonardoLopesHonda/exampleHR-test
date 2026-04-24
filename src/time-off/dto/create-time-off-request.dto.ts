import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateTimeOffRequestDto {
  @IsString()
  employeeId: string;

  @IsString()
  locationId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must be ISO date YYYY-MM-DD',
  })
  startDate: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must be ISO date YYYY-MM-DD',
  })
  endDate: string;

  @IsInt()
  @Min(1)
  daysRequested: number;

  @IsOptional()
  @IsString()
  managerId?: string;
}
