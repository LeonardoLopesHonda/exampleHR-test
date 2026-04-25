import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BalanceService } from '../balance/balance.service';
import { HcmMockClient } from '../hcm/hcm.client';
import { HcmTransientError } from '../hcm/hcm.errors';
import { TimeOffRequest, TimeOffStatus } from '../time-off/time-off.entity';
import { RetryJob, RetryJobStatus, RetryJobType } from './retry-job.entity';
import { RetryService } from './retry.service';
import { RetryWorker } from './retry.worker';

describe('RetryWorker', () => {
  let worker: RetryWorker;
  let retryService: jest.Mocked<RetryService>;
  let hcmClient: jest.Mocked<HcmMockClient>;
  let balanceService: jest.Mocked<BalanceService>;
  let requestRepo: jest.Mocked<Repository<TimeOffRequest>>;

  beforeEach(async () => {
    requestRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (e) => e as TimeOffRequest),
    } as unknown as jest.Mocked<Repository<TimeOffRequest>>;

    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (cb) =>
          cb({ getRepository: () => requestRepo }),
        ),
    } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        RetryWorker,
        {
          provide: RetryService,
          useValue: {
            claimDue: jest.fn(),
            markInProgress: jest.fn(),
            complete: jest.fn(),
            reschedule: jest.fn(),
          },
        },
        {
          provide: HcmMockClient,
          useValue: { submitApproval: jest.fn() },
        },
        {
          provide: BalanceService,
          useValue: { decrement: jest.fn() },
        },
        {
          provide: getRepositoryToken(TimeOffRequest),
          useValue: requestRepo,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    worker = module.get(RetryWorker);
    retryService = module.get(RetryService);
    hcmClient = module.get(HcmMockClient);
    balanceService = module.get(BalanceService);
  });

  function pendingJob(overrides: Partial<RetryJob> = {}): RetryJob {
    return {
      id: 'j-1',
      jobType: RetryJobType.HCM_APPROVAL,
      requestId: 'req-1',
      payload: JSON.stringify({ managerId: 'm-1' }),
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAt: 0,
      lastError: null,
      status: RetryJobStatus.PENDING,
      createdAt: 0,
      updatedAt: 0,
      ...overrides,
    };
  }

  function processingRequest(): TimeOffRequest {
    return {
      id: 'req-1',
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
      daysRequested: 5,
      status: TimeOffStatus.PROCESSING,
      managerId: 'm-1',
      rejectionReason: null,
    };
  }

  it('runOnce: HCM_APPROVAL job succeeds → completes job + APPROVES request', async () => {
    retryService.claimDue.mockResolvedValue([pendingJob()]);
    requestRepo.findOne.mockResolvedValue(processingRequest());
    hcmClient.submitApproval.mockResolvedValue({ hcmReferenceId: 'h-1' });

    await worker.runOnce();

    expect(retryService.markInProgress).toHaveBeenCalled();
    expect(retryService.complete).toHaveBeenCalled();
    expect(hcmClient.submitApproval).toHaveBeenCalled();
    expect(balanceService.decrement).toHaveBeenCalled();
    const lastSave = requestRepo.save.mock.calls.at(-1)![0] as TimeOffRequest;
    expect(lastSave.status).toBe(TimeOffStatus.APPROVED);
  });

  it('runOnce: HCM transient → reschedules', async () => {
    retryService.claimDue.mockResolvedValue([pendingJob()]);
    requestRepo.findOne.mockResolvedValue(processingRequest());
    hcmClient.submitApproval.mockRejectedValue(new HcmTransientError('5xx'));
    retryService.reschedule.mockResolvedValue('rescheduled');

    await worker.runOnce();

    expect(retryService.reschedule).toHaveBeenCalledWith(
      expect.any(Object),
      '5xx',
    );
    expect(retryService.complete).not.toHaveBeenCalled();
  });

  it('runOnce: exhaustion of HCM_APPROVAL → request marked FAILED', async () => {
    retryService.claimDue.mockResolvedValue([pendingJob({ attempts: 4 })]);
    requestRepo.findOne.mockResolvedValue(processingRequest());
    hcmClient.submitApproval.mockRejectedValue(
      new HcmTransientError('still down'),
    );
    retryService.reschedule.mockResolvedValue('exhausted');

    await worker.runOnce();

    const saved = requestRepo.save.mock.calls.at(-1)![0] as TimeOffRequest;
    expect(saved.status).toBe(TimeOffStatus.FAILED);
    expect(saved.rejectionReason).toContain('Retry exhausted');
  });

  it('runOnce: LOCAL_BALANCE_APPLY job runs Tx2 only (no HCM call)', async () => {
    retryService.claimDue.mockResolvedValue([
      pendingJob({ jobType: RetryJobType.LOCAL_BALANCE_APPLY }),
    ]);
    requestRepo.findOne.mockResolvedValue(processingRequest());

    await worker.runOnce();

    expect(hcmClient.submitApproval).not.toHaveBeenCalled();
    expect(balanceService.decrement).toHaveBeenCalled();
    expect(retryService.complete).toHaveBeenCalled();
  });
});
