import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Balance } from '../balance/balance.entity';
import { BalanceService } from '../balance/balance.service';
import { HcmMockClient } from '../hcm/hcm.client';
import { HcmPermanentError, HcmTransientError } from '../hcm/hcm.errors';
import { RetryJobType } from '../retry/retry-job.entity';
import { RetryService } from '../retry/retry.service';
import { ApproveTimeOffRequestDto } from './dto/approve-time-off-request.dto';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { RejectTimeOffRequestDto } from './dto/reject-time-off-request.dto';
import { TimeOffRequest, TimeOffStatus } from './time-off.entity';

@Injectable()
export class TimeOffService {
  private readonly logger = new Logger(TimeOffService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepository: Repository<TimeOffRequest>,
    private readonly balanceService: BalanceService,
    private readonly hcmClient: HcmMockClient,
    private readonly retryService: RetryService,
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

  async approve(
    id: string,
    dto: ApproveTimeOffRequestDto,
  ): Promise<TimeOffRequest> {
    // Tx1: validate and flip to PROCESSING. Commits before HCM is contacted.
    const current = await this.dataSource.transaction(async (manager) => {
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
      return repo.save(request);
    });

    // HCM call OUTSIDE any DB transaction.
    try {
      await this.hcmClient.submitApproval({
        requestId: current.id,
        employeeId: current.employeeId,
        locationId: current.locationId,
        daysRequested: current.daysRequested,
        managerId: dto.managerId,
      });
    } catch (err) {
      if (err instanceof HcmPermanentError) {
        this.logger.error(
          `HCM permanent failure for ${id}: ${err.message}; marking FAILED`,
        );
        return this.markFailed(current, err.message);
      }
      if (err instanceof HcmTransientError) {
        this.logger.warn(
          `HCM transient failure for ${id}: ${err.message}; enqueuing retry`,
        );
        await this.retryService.enqueue(RetryJobType.HCM_APPROVAL, id, {
          managerId: dto.managerId,
        });
        return current;
      }
      throw err;
    }

    // Tx2: apply balance and flip to APPROVED.
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(TimeOffRequest);
        await this.balanceService.decrement(
          current.employeeId,
          current.locationId,
          current.daysRequested,
          manager,
        );
        current.status = TimeOffStatus.APPROVED;
        return repo.save(current);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Local apply failed after HCM success for ${id}: ${message}; enqueuing retry`,
      );
      await this.retryService.enqueue(RetryJobType.LOCAL_BALANCE_APPLY, id, {
        managerId: dto.managerId,
      });
      return current;
    }
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

  private async markFailed(
    current: TimeOffRequest,
    reason: string,
  ): Promise<TimeOffRequest> {
    current.status = TimeOffStatus.FAILED;
    current.rejectionReason = reason;
    return this.requestRepository.save(current);
  }
}
