import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { LessThanOrEqual, Repository } from 'typeorm';
import { RetryJob, RetryJobStatus, RetryJobType } from './retry-job.entity';

const BACKOFF_MS = [0, 5_000, 15_000, 60_000, 300_000];

@Injectable()
export class RetryService {
  constructor(
    @InjectRepository(RetryJob)
    private readonly repo: Repository<RetryJob>,
  ) {}

  async enqueue(
    jobType: RetryJobType,
    requestId: string,
    payload: unknown,
  ): Promise<RetryJob> {
    const now = Date.now();
    const job: RetryJob = {
      id: randomUUID(),
      jobType,
      requestId,
      payload: JSON.stringify(payload),
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAt: now,
      lastError: null,
      status: RetryJobStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.save(job);
  }

  claimDue(limit: number): Promise<RetryJob[]> {
    return this.repo.find({
      where: {
        status: RetryJobStatus.PENDING,
        nextAttemptAt: LessThanOrEqual(Date.now()),
      },
      order: { nextAttemptAt: 'ASC' },
      take: limit,
    });
  }

  async markInProgress(job: RetryJob): Promise<void> {
    job.attempts += 1;
    job.status = RetryJobStatus.IN_PROGRESS;
    job.updatedAt = Date.now();
    await this.repo.save(job);
  }

  async complete(job: RetryJob): Promise<void> {
    job.status = RetryJobStatus.COMPLETED;
    job.updatedAt = Date.now();
    await this.repo.save(job);
  }

  async reschedule(
    job: RetryJob,
    error: string,
  ): Promise<'rescheduled' | 'exhausted'> {
    job.lastError = error;
    job.updatedAt = Date.now();
    if (job.attempts >= job.maxAttempts) {
      job.status = RetryJobStatus.EXHAUSTED;
      await this.repo.save(job);
      return 'exhausted';
    }
    const delay = BACKOFF_MS[Math.min(job.attempts, BACKOFF_MS.length - 1)];
    job.nextAttemptAt = Date.now() + delay;
    job.status = RetryJobStatus.PENDING;
    await this.repo.save(job);
    return 'rescheduled';
  }
}
