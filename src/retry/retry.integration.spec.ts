import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from '../balance/balance.entity';
import { BalanceModule } from '../balance/balance.module';
import { HcmMockClient } from '../hcm/hcm.client';
import { HcmModule } from '../hcm/hcm.module';
import { IdempotencyKey } from '../idempotency/idempotency-key.entity';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { TimeOffRequest, TimeOffStatus } from '../time-off/time-off.entity';
import { TimeOffModule } from '../time-off/time-off.module';
import { TimeOffService } from '../time-off/time-off.service';
import { RetryJob, RetryJobStatus } from './retry-job.entity';
import { RetryModule } from './retry.module';
import { RetryWorker } from './retry.worker';

describe('Retry (integration)', () => {
  let timeOff: TimeOffService;
  let worker: RetryWorker;
  let hcm: HcmMockClient;
  let balanceRepo: Repository<Balance>;
  let requestRepo: Repository<TimeOffRequest>;
  let jobRepo: Repository<RetryJob>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Balance, TimeOffRequest, IdempotencyKey, RetryJob],
          synchronize: true,
        }),
        BalanceModule,
        HcmModule,
        IdempotencyModule,
        RetryModule,
        TimeOffModule,
      ],
    }).compile();

    timeOff = module.get(TimeOffService);
    worker = module.get(RetryWorker);
    hcm = module.get(HcmMockClient);
    balanceRepo = module.get(getRepositoryToken(Balance));
    requestRepo = module.get(getRepositoryToken(TimeOffRequest));
    jobRepo = module.get(getRepositoryToken(RetryJob));

    await balanceRepo.save({
      employeeId: 'e',
      locationId: 'l',
      totalDays: 20,
      remainingDays: 10,
    });
  });

  async function createPending(): Promise<string> {
    hcm.clearProgrammed();
    const r = await timeOff.create({
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
      daysRequested: 5,
    });
    return r.id;
  }

  it('two transient HCM failures, third succeeds → APPROVED, balance decremented', async () => {
    const id = await createPending();
    hcm.setNextResults(['transient', 'transient', 'success']);

    await timeOff.approve(id, { managerId: 'm' });
    expect((await requestRepo.findOne({ where: { id } }))!.status).toBe(
      TimeOffStatus.PROCESSING,
    );

    // Worker tick 1: consumes second 'transient', reschedules with backoff
    await jobRepo.update(
      { status: RetryJobStatus.PENDING },
      { nextAttemptAt: 0 },
    );
    await worker.runOnce();
    expect((await requestRepo.findOne({ where: { id } }))!.status).toBe(
      TimeOffStatus.PROCESSING,
    );

    // Worker tick 2: consumes 'success', applies locally, completes
    await jobRepo.update(
      { status: RetryJobStatus.PENDING },
      { nextAttemptAt: 0 },
    );
    await worker.runOnce();

    const final = await requestRepo.findOne({ where: { id } });
    expect(final!.status).toBe(TimeOffStatus.APPROVED);
    const bal = await balanceRepo.findOne({
      where: { employeeId: 'e', locationId: 'l' },
    });
    expect(bal!.remainingDays).toBe(5);
  });

  it('5 transient failures in a row → exhaustion → request FAILED', async () => {
    const id = await createPending();
    hcm.setNextResults([
      'transient',
      'transient',
      'transient',
      'transient',
      'transient',
      'transient',
    ]);

    await timeOff.approve(id, { managerId: 'm' });

    for (let i = 0; i < 5; i++) {
      await jobRepo.update(
        { status: RetryJobStatus.PENDING },
        { nextAttemptAt: 0 },
      );
      await worker.runOnce();
    }

    const final = await requestRepo.findOne({ where: { id } });
    expect(final!.status).toBe(TimeOffStatus.FAILED);
    expect(final!.rejectionReason).toContain('Retry exhausted');
    const bal = await balanceRepo.findOne({
      where: { employeeId: 'e', locationId: 'l' },
    });
    expect(bal!.remainingDays).toBe(10);
  });

  it('HCM permanent failure on first call → FAILED immediately, no retry job', async () => {
    const id = await createPending();
    hcm.setNextResults(['permanent']);

    await timeOff.approve(id, { managerId: 'm' });

    expect((await requestRepo.findOne({ where: { id } }))!.status).toBe(
      TimeOffStatus.FAILED,
    );
    expect(await jobRepo.count()).toBe(0);
  });
});
