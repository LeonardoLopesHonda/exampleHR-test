import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { RetryJob, RetryJobStatus, RetryJobType } from './retry-job.entity';
import { RetryService } from './retry.service';

describe('RetryService', () => {
  let service: RetryService;
  let repo: jest.Mocked<Repository<RetryJob>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RetryService,
        {
          provide: getRepositoryToken(RetryJob),
          useValue: { save: jest.fn(), find: jest.fn(), findOne: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(RetryService);
    repo = module.get(getRepositoryToken(RetryJob));
  });

  it('enqueue persists a PENDING job with attempts=0 and computed delay', async () => {
    repo.save.mockImplementation(async (e) => e as RetryJob);
    const before = Date.now();
    await service.enqueue(RetryJobType.HCM_APPROVAL, 'req-1', {
      managerId: 'm',
    });
    const arg = repo.save.mock.calls[0][0] as RetryJob;
    expect(arg.jobType).toBe(RetryJobType.HCM_APPROVAL);
    expect(arg.requestId).toBe('req-1');
    expect(arg.attempts).toBe(0);
    expect(arg.maxAttempts).toBe(5);
    expect(arg.status).toBe(RetryJobStatus.PENDING);
    expect(arg.nextAttemptAt).toBeGreaterThanOrEqual(before);
    expect(JSON.parse(arg.payload)).toEqual({ managerId: 'm' });
  });

  it('claimDue returns PENDING jobs with nextAttemptAt <= now', async () => {
    repo.find.mockResolvedValue([]);
    await service.claimDue(10);
    expect(repo.find).toHaveBeenCalledWith({
      where: {
        status: RetryJobStatus.PENDING,
        nextAttemptAt: LessThanOrEqual(expect.any(Number)),
      },
      order: { nextAttemptAt: 'ASC' },
      take: 10,
    });
  });

  it('markInProgress increments attempts and sets IN_PROGRESS', async () => {
    const job: RetryJob = {
      id: 'j-1',
      jobType: RetryJobType.HCM_APPROVAL,
      requestId: 'req-1',
      payload: '{}',
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAt: 0,
      lastError: null,
      status: RetryJobStatus.PENDING,
      createdAt: 0,
      updatedAt: 0,
    };
    repo.save.mockImplementation(async (e) => e as RetryJob);
    await service.markInProgress(job);
    expect(job.attempts).toBe(1);
    expect(job.status).toBe(RetryJobStatus.IN_PROGRESS);
  });

  it('complete sets COMPLETED', async () => {
    const job = {
      id: 'j',
      status: RetryJobStatus.IN_PROGRESS,
    } as RetryJob;
    repo.save.mockImplementation(async (e) => e as RetryJob);
    await service.complete(job);
    expect(job.status).toBe(RetryJobStatus.COMPLETED);
  });

  it('reschedule (attempts < max) sets PENDING with backoff', async () => {
    const job: RetryJob = {
      id: 'j',
      jobType: RetryJobType.HCM_APPROVAL,
      requestId: 'r',
      payload: '{}',
      attempts: 2,
      maxAttempts: 5,
      nextAttemptAt: 0,
      lastError: null,
      status: RetryJobStatus.IN_PROGRESS,
      createdAt: 0,
      updatedAt: 0,
    };
    repo.save.mockImplementation(async (e) => e as RetryJob);
    const before = Date.now();
    const result = await service.reschedule(job, 'transient boom');
    expect(result).toBe('rescheduled');
    expect(job.status).toBe(RetryJobStatus.PENDING);
    expect(job.lastError).toBe('transient boom');
    expect(job.nextAttemptAt).toBeGreaterThanOrEqual(before + 15_000);
  });

  it('reschedule at max attempts sets EXHAUSTED', async () => {
    const job: RetryJob = {
      id: 'j',
      jobType: RetryJobType.HCM_APPROVAL,
      requestId: 'r',
      payload: '{}',
      attempts: 5,
      maxAttempts: 5,
      nextAttemptAt: 0,
      lastError: null,
      status: RetryJobStatus.IN_PROGRESS,
      createdAt: 0,
      updatedAt: 0,
    };
    repo.save.mockImplementation(async (e) => e as RetryJob);
    const result = await service.reschedule(job, 'still boom');
    expect(result).toBe('exhausted');
    expect(job.status).toBe(RetryJobStatus.EXHAUSTED);
  });
});
