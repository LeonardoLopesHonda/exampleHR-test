import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { Balance } from '../src/balance/balance.entity';
import { BalanceModule } from '../src/balance/balance.module';
import { HcmMockClient } from '../src/hcm/hcm.client';
import { HcmModule } from '../src/hcm/hcm.module';
import { IdempotencyKey } from '../src/idempotency/idempotency-key.entity';
import { IdempotencyModule } from '../src/idempotency/idempotency.module';
import { RetryJob } from '../src/retry/retry-job.entity';
import { RetryModule } from '../src/retry/retry.module';
import { TimeOffRequest } from '../src/time-off/time-off.entity';
import { TimeOffModule } from '../src/time-off/time-off.module';

describe('Phase 3 (e2e)', () => {
  let app: INestApplication;
  let hcm: HcmMockClient;
  let balanceRepo: Repository<Balance>;
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

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    hcm = module.get(HcmMockClient);
    balanceRepo = module.get(getRepositoryToken(Balance));
    jobRepo = module.get(getRepositoryToken(RetryJob));

    await balanceRepo.save({
      employeeId: 'e',
      locationId: 'l',
      totalDays: 20,
      remainingDays: 10,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const validBody = {
    employeeId: 'e',
    locationId: 'l',
    startDate: '2026-05-01',
    endDate: '2026-05-05',
    daysRequested: 5,
  };

  it('replays response on duplicate POST /timeoff/request with same Idempotency-Key', async () => {
    const a = await request(app.getHttpServer())
      .post('/timeoff/request')
      .set('Idempotency-Key', 'k')
      .send(validBody)
      .expect(201);

    const b = await request(app.getHttpServer())
      .post('/timeoff/request')
      .set('Idempotency-Key', 'k')
      .send(validBody)
      .expect(201);

    expect(b.body.id).toBe(a.body.id);
  });

  it('approve with HCM permanent failure → request status FAILED, no retry job', async () => {
    const created = await request(app.getHttpServer())
      .post('/timeoff/request')
      .send(validBody)
      .expect(201);

    hcm.setNextResults(['permanent']);

    const approved = await request(app.getHttpServer())
      .post(`/timeoff/${created.body.id}/approve`)
      .send({ managerId: 'm' })
      .expect(201);

    expect(approved.body.status).toBe('FAILED');
    expect(await jobRepo.count()).toBe(0);
  });

  it('approve with HCM transient failure → PROCESSING + retry job persisted', async () => {
    const created = await request(app.getHttpServer())
      .post('/timeoff/request')
      .send(validBody)
      .expect(201);

    hcm.setNextResults(['transient']);

    const approved = await request(app.getHttpServer())
      .post(`/timeoff/${created.body.id}/approve`)
      .send({ managerId: 'm' })
      .expect(201);

    expect(approved.body.status).toBe('PROCESSING');
    expect(await jobRepo.count()).toBe(1);
  });
});
