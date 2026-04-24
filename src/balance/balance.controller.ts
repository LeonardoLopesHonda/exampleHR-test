import { Controller, Get, Param } from '@nestjs/common';
import { Balance } from './balance.entity';
import { BalanceService } from './balance.service';

@Controller('balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get(':employeeId/:locationId')
  findOne(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ): Promise<Balance> {
    return this.balanceService.findOne(employeeId, locationId);
  }
}
