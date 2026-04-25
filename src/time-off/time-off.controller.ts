import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApproveTimeOffRequestDto } from './dto/approve-time-off-request.dto';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { RejectTimeOffRequestDto } from './dto/reject-time-off-request.dto';
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

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveTimeOffRequestDto,
  ): Promise<TimeOffRequest> {
    return this.timeOffService.approve(id, dto);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectTimeOffRequestDto,
  ): Promise<TimeOffRequest> {
    return this.timeOffService.reject(id, dto);
  }
}
