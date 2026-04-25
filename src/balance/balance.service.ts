import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from './balance.entity';

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
  ) {}

  async findOne(employeeId: string, locationId: string): Promise<Balance> {
    const balance = await this.balanceRepository.findOne({
      where: { employeeId, locationId },
    });
    if (!balance) {
      throw new NotFoundException(
        `Balance not found for employee ${employeeId} at location ${locationId}`,
      );
    }
    return balance;
  }
}
