import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Balance } from '../balance/balance.entity';
import { BalanceService } from '../balance/balance.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { TimeOffRequest, TimeOffStatus } from './time-off.entity';

@Injectable()
export class TimeOffService {
  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepository: Repository<TimeOffRequest>,
    private readonly balanceService: BalanceService,
  ) {}

  async create(dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    let balance: Balance;
    try {
      balance = await this.balanceService.findOne(
        dto.employeeId,
        dto.locationId,
      );
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new BadRequestException(
          `No balance found for employee ${dto.employeeId} at location ${dto.locationId}`,
        );
      }
      throw err;
    }

    if (dto.daysRequested > balance.remainingDays) {
      throw new BadRequestException(
        `Requested ${dto.daysRequested} days but only ${balance.remainingDays} remain`,
      );
    }

    const request: TimeOffRequest = {
      id: randomUUID(),
      employeeId: dto.employeeId,
      locationId: dto.locationId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      daysRequested: dto.daysRequested,
      status: TimeOffStatus.PENDING,
      managerId: dto.managerId ?? null,
      rejectionReason: null,
    };

    return this.requestRepository.save(request);
  }

  async findOne(id: string): Promise<TimeOffRequest> {
    const request = await this.requestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Time-off request ${id} not found`);
    }
    return request;
  }

  findByEmployee(employeeId: string): Promise<TimeOffRequest[]> {
    return this.requestRepository.find({ where: { employeeId } });
  }
}
