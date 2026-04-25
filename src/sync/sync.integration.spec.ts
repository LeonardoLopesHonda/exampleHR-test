import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { Balance } from '../balance/balance.entity';
import { HcmMockClient } from '../hcm/hcm.client';
import { SyncService } from './sync.service';

describe('SyncService (integration)', () => {
  let app: INestApplication;
  let syncService: SyncService;
  let balanceRepo: Repository<Balance>;
  let hcm: HcmMockClient;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    syncService = module.get(SyncService);
    balanceRepo = module.get(getRepositoryToken(Balance));
    hcm = module.get(HcmMockClient);
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await balanceRepo.clear();
    hcm.clearProgrammed();
  });

  it('inserts a new balance from HCM into an empty local DB', async () => {
    hcm.setProgrammedBalances([
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        totalDays: 25,
        remainingDays: 20,
      },
    ]);

    const result = await syncService.runBatchSync();

    expect(result).toEqual({ synced: 1, skipped: 0, failed: [] });
    const saved = await balanceRepo.findOne({
      where: { employeeId: 'emp-1', locationId: 'loc-1' },
    });
    expect(saved?.remainingDays).toBe(20);
  });

  it('overwrites a local balance with the HCM value', async () => {
    await balanceRepo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 25,
      remainingDays: 25,
    });
    hcm.setProgrammedBalances([
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        totalDays: 25,
        remainingDays: 18,
      },
    ]);

    const result = await syncService.runBatchSync();

    expect(result.synced).toBe(1);
    const updated = await balanceRepo.findOne({
      where: { employeeId: 'emp-1', locationId: 'loc-1' },
    });
    expect(updated?.remainingDays).toBe(18);
  });

  it('skips a balance that already matches HCM', async () => {
    await balanceRepo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 25,
      remainingDays: 20,
    });
    hcm.setProgrammedBalances([
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        totalDays: 25,
        remainingDays: 20,
      },
    ]);

    const result = await syncService.runBatchSync();

    expect(result).toEqual({ synced: 0, skipped: 1, failed: [] });
  });

  it('is idempotent: second sync with same HCM data skips all', async () => {
    hcm.setProgrammedBalances([
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        totalDays: 25,
        remainingDays: 20,
      },
    ]);
    await syncService.runBatchSync();

    hcm.setProgrammedBalances([
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        totalDays: 25,
        remainingDays: 20,
      },
    ]);
    const second = await syncService.runBatchSync();

    expect(second).toEqual({ synced: 0, skipped: 1, failed: [] });
    const balance = await balanceRepo.findOne({
      where: { employeeId: 'emp-1', locationId: 'loc-1' },
    });
    expect(balance?.remainingDays).toBe(20);
  });

  it('syncs multiple balances in a single batch', async () => {
    hcm.setProgrammedBalances([
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
        remainingDays: 8,
      },
    ]);

    const result = await syncService.runBatchSync();

    expect(result).toEqual({ synced: 2, skipped: 0, failed: [] });
  });
});
