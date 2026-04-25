import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BalanceService } from '../balance/balance.service';
import { HcmMockClient } from '../hcm/hcm.client';
import { HcmPermanentError } from '../hcm/hcm.errors';
import { TimeOffRequest, TimeOffStatus } from '../time-off/time-off.entity';
import { RetryJob, RetryJobType } from './retry-job.entity';
import { RetryService } from './retry.service';

@Injectable()
export class RetryWorker {
  private readonly logger = new Logger(RetryWorker.name);

  constructor(
    private readonly retryService: RetryService,
    private readonly hcmClient: HcmMockClient,
    private readonly balanceService: BalanceService,
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick(): Promise<void> {
    await this.runOnce();
  }

  async runOnce(): Promise<void> {
    const due = await this.retryService.claimDue(10);
    for (const job of due) {
      await this.processOne(job);
    }
  }

  private async processOne(job: RetryJob): Promise<void> {
    await this.retryService.markInProgress(job);
    try {
      const request = await this.requestRepo.findOne({
        where: { id: job.requestId },
      });
      if (!request) {
        throw new Error(`request ${job.requestId} not found`);
      }
      const payload = JSON.parse(job.payload) as { managerId: string };

      if (job.jobType === RetryJobType.HCM_APPROVAL) {
        await this.hcmClient.submitApproval({
          requestId: request.id,
          employeeId: request.employeeId,
          locationId: request.locationId,
          daysRequested: request.daysRequested,
          managerId: payload.managerId,
        });
        await this.applyLocally(request, payload.managerId);
      } else {
        await this.applyLocally(request, payload.managerId);
      }
      await this.retryService.complete(job);
    } catch (err) {
      if (err instanceof HcmPermanentError) {
        this.logger.error(
          `Job ${job.id}: permanent HCM failure: ${err.message}`,
        );
        await this.markRequestFailed(job.requestId, err.message);
        await this.retryService.complete(job);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Job ${job.id}: attempt ${job.attempts} failed: ${message}`,
      );
      const outcome = await this.retryService.reschedule(job, message);
      if (outcome === 'exhausted') {
        await this.markRequestFailed(
          job.requestId,
          `Retry exhausted after ${job.attempts} attempts: ${message}`,
        );
      }
    }
  }

  private async applyLocally(
    request: TimeOffRequest,
    managerId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.balanceService.decrement(
        request.employeeId,
        request.locationId,
        request.daysRequested,
        manager,
      );
      const repo = manager.getRepository(TimeOffRequest);
      request.status = TimeOffStatus.APPROVED;
      request.managerId = managerId;
      await repo.save(request);
    });
  }

  private async markRequestFailed(
    requestId: string,
    reason: string,
  ): Promise<void> {
    const fresh = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!fresh) return;
    fresh.status = TimeOffStatus.FAILED;
    fresh.rejectionReason = reason;
    await this.requestRepo.save(fresh);
  }
}
