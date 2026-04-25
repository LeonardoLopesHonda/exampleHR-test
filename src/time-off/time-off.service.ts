import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Balance } from '../balance/balance.entity';
import { BalanceService } from '../balance/balance.service';
import { HcmMockClient } from '../hcm/hcm.client';
import { ApproveTimeOffRequestDto } from './dto/approve-time-off-request.dto';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { RejectTimeOffRequestDto } from './dto/reject-time-off-request.dto';
import { TimeOffRequest, TimeOffStatus } from './time-off.entity';

@Injectable()
export class TimeOffService {
  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepository: Repository<TimeOffRequest>,
    private readonly balanceService: BalanceService,
    private readonly hcmClient: HcmMockClient,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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

  approve(
    id: string,
    dto: ApproveTimeOffRequestDto,
  ): Promise<TimeOffRequest> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TimeOffRequest);
      const request = await repo.findOne({ where: { id } });
      if (!request) {
        throw new NotFoundException(`Time-off request ${id} not found`);
      }
      if (request.status !== TimeOffStatus.PENDING) {
        throw new BadRequestException(
          `Cannot approve request in status ${request.status}; expected PENDING`,
        );
      }

      request.status = TimeOffStatus.PROCESSING;
      request.managerId = dto.managerId;
      await repo.save(request);

      await this.hcmClient.submitApproval({
        requestId: request.id,
        employeeId: request.employeeId,
        locationId: request.locationId,
        daysRequested: request.daysRequested,
        managerId: dto.managerId,
      });

      await this.balanceService.decrement(
        request.employeeId,
        request.locationId,
        request.daysRequested,
        manager,
      );

      request.status = TimeOffStatus.APPROVED;
      return repo.save(request);
    });
  }

  async reject(
    id: string,
    dto: RejectTimeOffRequestDto,
  ): Promise<TimeOffRequest> {
    const request = await this.requestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Time-off request ${id} not found`);
    }
    if (request.status !== TimeOffStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject request in status ${request.status}; expected PENDING`,
      );
    }

    request.status = TimeOffStatus.REJECTED;
    request.managerId = dto.managerId;
    request.rejectionReason = dto.reason ?? null;
    return this.requestRepository.save(request);
  }
}
