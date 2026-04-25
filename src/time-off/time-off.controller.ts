import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { TimeOffRequest } from './time-off.entity';
import { TimeOffService } from './time-off.service';

@Controller('timeoff')
export class TimeOffController {
  constructor(private readonly timeOffService: TimeOffService) {}

  @Post('request')
  create(@Body() dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    return this.timeOffService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<TimeOffRequest> {
    return this.timeOffService.findOne(id);
  }

  @Get()
  findByEmployee(
    @Query('employeeId') employeeId: string,
  ): Promise<TimeOffRequest[]> {
    return this.timeOffService.findByEmployee(employeeId);
  }
}
