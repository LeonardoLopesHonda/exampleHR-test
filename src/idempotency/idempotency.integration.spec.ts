import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { Balance } from '../balance/balance.entity';
import { BalanceModule } from '../balance/balance.module';
import { HcmModule } from '../hcm/hcm.module';
import { TimeOffRequest } from '../time-off/time-off.entity';
import { TimeOffModule } from '../time-off/time-off.module';
import { IdempotencyKey } from './idempotency-key.entity';
import { IdempotencyModule } from './idempotency.module';

describe('Idempotency (integration)', () => {
  let app: INestApplication;
  let balanceRepo: Repository<Balance>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Balance, TimeOffRequest, IdempotencyKey],
          synchronize: true,
        }),
        BalanceModule,
        HcmModule,
        IdempotencyModule,
        TimeOffModule,
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    balanceRepo = module.get(getRepositoryToken(Balance));
    await balanceRepo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 10,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const validBody = {
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: '2026-05-01',
    endDate: '2026-05-05',
    daysRequested: 5,
  };

  it('replays cached response for the same key + body', async () => {
    const first = await request(app.getHttpServer())
      .post('/timeoff/request')
      .set('Idempotency-Key', 'k-1')
      .send(validBody)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/timeoff/request')
      .set('Idempotency-Key', 'k-1')
      .send(validBody)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it('rejects same key with different body (409 Conflict)', async () => {
    await request(app.getHttpServer())
      .post('/timeoff/request')
      .set('Idempotency-Key', 'k-2')
      .send(validBody)
      .expect(201);

    await request(app.getHttpServer())
      .post('/timeoff/request')
      .set('Idempotency-Key', 'k-2')
      .send({ ...validBody, daysRequested: 1 })
      .expect(409);
  });

  it('does not cache when handler throws (replay re-executes)', async () => {
    await request(app.getHttpServer())
      .post('/timeoff/request')
      .set('Idempotency-Key', 'k-3')
      .send({ ...validBody, employeeId: 'no-such-emp' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/timeoff/request')
      .set('Idempotency-Key', 'k-3')
      .send({ ...validBody, employeeId: 'no-such-emp' })
      .expect(400);
  });
});
