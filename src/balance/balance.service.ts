import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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

  async decrement(
    employeeId: string,
    locationId: string,
    days: number,
    manager?: EntityManager,
  ): Promise<Balance> {
    const repo = manager ? manager.getRepository(Balance) : this.balanceRepository;

    const balance = await repo.findOne({ where: { employeeId, locationId } });
    if (!balance) {
      throw new NotFoundException(
        `Balance not found for employee ${employeeId} at location ${locationId}`,
      );
    }
    if (balance.remainingDays < days) {
      throw new BadRequestException(
        `Cannot decrement ${days} days; only ${balance.remainingDays} remain for employee ${employeeId}`,
      );
    }
    balance.remainingDays -= days;
    return repo.save(balance);
  }
}
