import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Balance } from '../balance/balance.entity';
import { HcmBalanceSnapshot, HcmMockClient } from '../hcm/hcm.client';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  let service: SyncService;
  let hcm: HcmMockClient;
  let balanceRepo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    balanceRepo = { findOne: jest.fn(), save: jest.fn() };
    hcm = new HcmMockClient();
    const module = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: HcmMockClient, useValue: hcm },
        { provide: getRepositoryToken(Balance), useValue: balanceRepo },
      ],
    }).compile();
    service = module.get(SyncService);
  });

  it('returns zeroed summary when HCM has no balances', async () => {
    hcm.setProgrammedBalances([]);
    const result = await service.runBatchSync();
    expect(result).toEqual({ synced: 0, skipped: 0, failed: [] });
    expect(balanceRepo.save).not.toHaveBeenCalled();
  });

  it('inserts a balance not present locally', async () => {
    const snapshot: HcmBalanceSnapshot = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 25,
      remainingDays: 20,
    };
    hcm.setProgrammedBalances([snapshot]);
    balanceRepo.findOne.mockResolvedValue(null);
    balanceRepo.save.mockResolvedValue(snapshot);

    const result = await service.runBatchSync();

    expect(balanceRepo.save).toHaveBeenCalledWith(snapshot);
    expect(result).toEqual({ synced: 1, skipped: 0, failed: [] });
  });

  it('updates a local balance that differs from HCM', async () => {
    const local: Balance = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 25,
      remainingDays: 25,
    };
    const snapshot: HcmBalanceSnapshot = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 25,
      remainingDays: 20,
    };
    hcm.setProgrammedBalances([snapshot]);
    balanceRepo.findOne.mockResolvedValue(local);
    balanceRepo.save.mockResolvedValue({ ...local, remainingDays: 20 });

    const result = await service.runBatchSync();

    expect(balanceRepo.save).toHaveBeenCalledWith({
      ...local,
      totalDays: 25,
      remainingDays: 20,
    });
    expect(result).toEqual({ synced: 1, skipped: 0, failed: [] });
  });

  it('skips a balance already matching HCM', async () => {
    const local: Balance = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 25,
      remainingDays: 20,
    };
    hcm.setProgrammedBalances([
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        totalDays: 25,
        remainingDays: 20,
      },
    ]);
    balanceRepo.findOne.mockResolvedValue(local);

    const result = await service.runBatchSync();

    expect(balanceRepo.save).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, skipped: 1, failed: [] });
  });

  it('records failure and continues when one balance throws', async () => {
    const snapshots: HcmBalanceSnapshot[] = [
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        totalDays: 25,
        remainingDays: 20,
      },
      {
        employeeId: 'emp-2',
        locationId: 'loc-1',
        totalDays: 10,
        remainingDays: 10,
      },
    ];
    hcm.setProgrammedBalances(snapshots);
    balanceRepo.findOne.mockResolvedValue(null);
    balanceRepo.save
      .mockRejectedValueOnce(new Error('DB constraint'))
      .mockResolvedValueOnce(snapshots[1]);

    const result = await service.runBatchSync();

    expect(result.synced).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      error: 'DB constraint',
    });
  });
});
