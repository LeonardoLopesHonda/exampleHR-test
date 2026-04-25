import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { Balance } from '../src/balance/balance.entity';
import { HcmMockClient } from '../src/hcm/hcm.client';
import { HcmModule } from '../src/hcm/hcm.module';
import { SyncModule } from '../src/sync/sync.module';

describe('POST /sync/batch (e2e)', () => {
  let app: INestApplication<App>;
  let balanceRepo: Repository<Balance>;
  let hcm: HcmMockClient;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Balance],
          synchronize: true,
        }),
        HcmModule,
        SyncModule,
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    balanceRepo = module.get(getRepositoryToken(Balance));
    hcm = module.get(HcmMockClient);
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await balanceRepo.clear();
    hcm.clearProgrammed();
  });

  it('201 with synced=1 when HCM returns a new balance', async () => {
    hcm.setProgrammedBalances([
      {
        employeeId: 'emp-1',
        locationId: 'loc-1',
        totalDays: 25,
        remainingDays: 20,
      },
    ]);

    const { body } = await request(app.getHttpServer())
      .post('/sync/batch')
      .expect(201);

    expect(body).toEqual({ synced: 1, skipped: 0, failed: [] });
  });

  it('201 with skipped=1 when local balance already matches HCM', async () => {
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

    const { body } = await request(app.getHttpServer())
      .post('/sync/batch')
      .expect(201);

    expect(body).toEqual({ synced: 0, skipped: 1, failed: [] });
  });

  it('201 with synced=0 skipped=0 when HCM has no balances', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/sync/batch')
      .expect(201);

    expect(body).toEqual({ synced: 0, skipped: 0, failed: [] });
  });
});
