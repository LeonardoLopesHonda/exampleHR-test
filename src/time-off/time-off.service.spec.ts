import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Balance } from '../balance/balance.entity';
import { BalanceService } from '../balance/balance.service';
import { HcmMockClient } from '../hcm/hcm.client';
import { HcmPermanentError, HcmTransientError } from '../hcm/hcm.errors';
import { RetryJobType } from '../retry/retry-job.entity';
import { RetryService } from '../retry/retry.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { TimeOffRequest, TimeOffStatus } from './time-off.entity';
import { TimeOffService } from './time-off.service';

describe('TimeOffService', () => {
  let service: TimeOffService;
  let repo: jest.Mocked<Repository<TimeOffRequest>>;
  let balanceService: jest.Mocked<BalanceService>;
  let hcm: jest.Mocked<HcmMockClient>;
  let retryService: jest.Mocked<RetryService>;
  let txnRepo: jest.Mocked<Repository<TimeOffRequest>>;
  let txnManager: EntityManager;

  const balance: Balance = {
    employeeId: 'emp-1',
    locationId: 'loc-1',
    totalDays: 20,
    remainingDays: 10,
  };

  const validDto: CreateTimeOffRequestDto = {
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: '2026-05-01',
    endDate: '2026-05-05',
    daysRequested: 5,
  };

  const pendingRequest: TimeOffRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: '2026-05-01',
    endDate: '2026-05-05',
    daysRequested: 5,
    status: TimeOffStatus.PENDING,
    managerId: null,
    rejectionReason: null,
  };

  beforeEach(async () => {
    txnRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (e) => e),
    } as unknown as jest.Mocked<Repository<TimeOffRequest>>;

    txnManager = {
      getRepository: jest.fn().mockReturnValue(txnRepo),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(txnManager)),
    } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        TimeOffService,
        {
          provide: getRepositoryToken(TimeOffRequest),
          useValue: {
            save: jest.fn((entity) => Promise.resolve(entity)),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: BalanceService,
          useValue: { findOne: jest.fn(), decrement: jest.fn() },
        },
        {
          provide: HcmMockClient,
          useValue: { submitApproval: jest.fn() },
        },
        {
          provide: RetryService,
          useValue: { enqueue: jest.fn() },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TimeOffService);
    repo = module.get(getRepositoryToken(TimeOffRequest));
    balanceService = module.get(BalanceService);
    hcm = module.get(HcmMockClient);
    retryService = module.get(RetryService);
  });

  describe('create', () => {
    it('creates a PENDING request when balance is sufficient', async () => {
      balanceService.findOne.mockResolvedValue(balance);

      const result = await service.create(validDto);

      expect(result.status).toBe(TimeOffStatus.PENDING);
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(result.employeeId).toBe('emp-1');
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects when daysRequested exceeds remainingDays', async () => {
      balanceService.findOne.mockResolvedValue({
        ...balance,
        remainingDays: 3,
      });

      await expect(service.create(validDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects when no balance row exists (NotFound surfaces as BadRequest)', async () => {
      balanceService.findOne.mockRejectedValue(new NotFoundException());

      await expect(service.create(validDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects when endDate is before startDate', async () => {
      balanceService.findOne.mockResolvedValue(balance);
      const bad = {
        ...validDto,
        startDate: '2026-05-10',
        endDate: '2026-05-05',
      };

      await expect(service.create(bad)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('does not decrement the balance', async () => {
      balanceService.findOne.mockResolvedValue(balance);

      await service.create(validDto);

      expect(balanceService.decrement).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the request when found', async () => {
      repo.findOne.mockResolvedValue(pendingRequest);

      const result = await service.findOne('req-1');

      expect(result).toEqual(pendingRequest);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'req-1' } });
    });

    it('throws NotFoundException when missing', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findByEmployee', () => {
    it('returns all requests for an employee', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.findByEmployee('emp-1');

      expect(result).toEqual([]);
      expect(repo.find).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1' },
      });
    });
  });

  describe('approve', () => {
    it('flips PENDING -> PROCESSING -> APPROVED, calls HCM in between, decrements balance', async () => {
      txnRepo.findOne.mockResolvedValue({ ...pendingRequest });
      const savedStatuses: TimeOffStatus[] = [];
      txnRepo.save.mockImplementation(async (e) => {
        savedStatuses.push((e as TimeOffRequest).status);
        return e as TimeOffRequest;
      });
      hcm.submitApproval.mockResolvedValue({ hcmReferenceId: 'hcm-ref-1' });
      balanceService.decrement.mockResolvedValue({
        ...balance,
        remainingDays: 5,
      });

      const result = await service.approve('req-1', { managerId: 'mgr-1' });

      expect(savedStatuses).toEqual([
        TimeOffStatus.PROCESSING,
        TimeOffStatus.APPROVED,
      ]);

      expect(hcm.submitApproval).toHaveBeenCalledWith({
        requestId: 'req-1',
        employeeId: 'emp-1',
        locationId: 'loc-1',
        daysRequested: 5,
        managerId: 'mgr-1',
      });

      expect(balanceService.decrement).toHaveBeenCalledWith(
        'emp-1',
        'loc-1',
        5,
        expect.anything(),
      );

      expect(result.status).toBe(TimeOffStatus.APPROVED);
      expect(result.managerId).toBe('mgr-1');
    });

    it('writes PROCESSING BEFORE invoking HCM', async () => {
      txnRepo.findOne.mockResolvedValue({ ...pendingRequest });
      const observed: TimeOffStatus[] = [];
      hcm.submitApproval.mockImplementation(async () => {
        const last = txnRepo.save.mock.calls.at(-1)?.[0] as
          | TimeOffRequest
          | undefined;
        observed.push(last!.status);
        return { hcmReferenceId: 'hcm-ref-2' };
      });
      balanceService.decrement.mockResolvedValue(balance);

      await service.approve('req-1', { managerId: 'mgr-1' });

      expect(observed).toEqual([TimeOffStatus.PROCESSING]);
    });

    it('writes APPROVED and decrements only AFTER HCM resolves', async () => {
      txnRepo.findOne.mockResolvedValue({ ...pendingRequest });
      const savedStatuses: TimeOffStatus[] = [];
      txnRepo.save.mockImplementation(async (e) => {
        savedStatuses.push((e as TimeOffRequest).status);
        return e as TimeOffRequest;
      });
      let hcmReturned = false;
      hcm.submitApproval.mockImplementation(async () => {
        hcmReturned = true;
        return { hcmReferenceId: 'hcm-ref-3' };
      });
      balanceService.decrement.mockImplementation(async () => {
        expect(hcmReturned).toBe(true);
        return balance;
      });

      await service.approve('req-1', { managerId: 'mgr-1' });

      expect(savedStatuses[1]).toBe(TimeOffStatus.APPROVED);
    });

    it('throws NotFoundException when the request does not exist', async () => {
      txnRepo.findOne.mockResolvedValue(null);

      await expect(
        service.approve('missing', { managerId: 'mgr-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(hcm.submitApproval).not.toHaveBeenCalled();
      expect(balanceService.decrement).not.toHaveBeenCalled();
    });

    it('rejects approving a non-PENDING request with BadRequestException', async () => {
      txnRepo.findOne.mockResolvedValue({
        ...pendingRequest,
        status: TimeOffStatus.APPROVED,
      });

      await expect(
        service.approve('req-1', { managerId: 'mgr-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(hcm.submitApproval).not.toHaveBeenCalled();
      expect(balanceService.decrement).not.toHaveBeenCalled();
    });

    it('on HcmTransientError: stays PROCESSING and enqueues HCM_APPROVAL retry', async () => {
      txnRepo.findOne.mockResolvedValue({ ...pendingRequest });
      hcm.submitApproval.mockRejectedValue(
        new HcmTransientError('5xx from HCM'),
      );

      const result = await service.approve('req-1', { managerId: 'mgr-1' });

      expect(result.status).toBe(TimeOffStatus.PROCESSING);
      expect(retryService.enqueue).toHaveBeenCalledWith(
        RetryJobType.HCM_APPROVAL,
        'req-1',
        { managerId: 'mgr-1' },
      );
      expect(balanceService.decrement).not.toHaveBeenCalled();
    });

    it('on HcmPermanentError: marks FAILED and does NOT enqueue', async () => {
      txnRepo.findOne.mockResolvedValue({ ...pendingRequest });
      hcm.submitApproval.mockRejectedValue(
        new HcmPermanentError('insufficient balance per HCM'),
      );

      const result = await service.approve('req-1', { managerId: 'mgr-1' });

      expect(result.status).toBe(TimeOffStatus.FAILED);
      expect(result.rejectionReason).toBe('insufficient balance per HCM');
      expect(retryService.enqueue).not.toHaveBeenCalled();
      expect(balanceService.decrement).not.toHaveBeenCalled();
    });

    it('on Tx2 failure after HCM success: stays PROCESSING and enqueues LOCAL_BALANCE_APPLY', async () => {
      txnRepo.findOne.mockResolvedValue({ ...pendingRequest });
      hcm.submitApproval.mockResolvedValue({ hcmReferenceId: 'hcm-ref-x' });
      balanceService.decrement.mockRejectedValue(new Error('lock timeout'));

      const result = await service.approve('req-1', { managerId: 'mgr-1' });

      expect(result.status).toBe(TimeOffStatus.PROCESSING);
      expect(retryService.enqueue).toHaveBeenCalledWith(
        RetryJobType.LOCAL_BALANCE_APPLY,
        'req-1',
        { managerId: 'mgr-1' },
      );
    });
  });

  describe('reject', () => {
    it('flips PENDING -> REJECTED, persists managerId and reason, no HCM, no balance change', async () => {
      repo.findOne.mockResolvedValue({ ...pendingRequest });

      const result = await service.reject('req-1', {
        managerId: 'mgr-1',
        reason: 'overlap with peak season',
      });

      expect(result.status).toBe(TimeOffStatus.REJECTED);
      expect(result.managerId).toBe('mgr-1');
      expect(result.rejectionReason).toBe('overlap with peak season');
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(hcm.submitApproval).not.toHaveBeenCalled();
      expect(balanceService.decrement).not.toHaveBeenCalled();
    });

    it('persists null rejectionReason when reason is omitted', async () => {
      repo.findOne.mockResolvedValue({ ...pendingRequest });

      const result = await service.reject('req-1', { managerId: 'mgr-1' });

      expect(result.rejectionReason).toBeNull();
    });

    it('throws NotFoundException when the request does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.reject('missing', { managerId: 'mgr-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects rejecting a non-PENDING request with BadRequestException', async () => {
      repo.findOne.mockResolvedValue({
        ...pendingRequest,
        status: TimeOffStatus.REJECTED,
      });

      await expect(
        service.reject('req-1', { managerId: 'mgr-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
