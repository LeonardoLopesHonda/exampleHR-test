import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  TypeOrmModule,
  TypeOrmModuleOptions,
  getRepositoryToken,
} from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { Balance } from '../src/balance/balance.entity';
import { BalanceModule } from '../src/balance/balance.module';
import { TimeOffStatus, TimeOffRequest } from '../src/time-off/time-off.entity';
import { TimeOffModule } from '../src/time-off/time-off.module';

describe('TimeOff (e2e)', () => {
  let app: INestApplication<App>;
  let balanceRepo: Repository<Balance>;

  beforeEach(async () => {
    const dbConfig: TypeOrmModuleOptions = {
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Balance, TimeOffRequest],
      synchronize: true,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(dbConfig), BalanceModule, TimeOffModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    balanceRepo = moduleFixture.get(getRepositoryToken(Balance));
    await balanceRepo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 15,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /timeoff/request creates a request and persists it', async () => {
    const create = await request(app.getHttpServer())
      .post('/timeoff/request')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2026-05-01',
        endDate: '2026-05-03',
        daysRequested: 3,
      })
      .expect(201);

    const created = create.body as TimeOffRequest;
    expect(created.id).toBeDefined();
    expect(created.status).toBe(TimeOffStatus.PENDING);

    const fetched = await request(app.getHttpServer())
      .get(`/timeoff/${created.id}`)
      .expect(200);
    expect((fetched.body as TimeOffRequest).id).toBe(created.id);

    const list = await request(app.getHttpServer())
      .get('/timeoff')
      .query({ employeeId: 'emp-1' })
      .expect(200);
    const listBody = list.body as TimeOffRequest[];
    expect(listBody).toHaveLength(1);
    expect(listBody[0].id).toBe(created.id);
  });

  it('GET /balances/:employeeId/:locationId returns the balance', async () => {
    const res = await request(app.getHttpServer())
      .get('/balances/emp-1/loc-1')
      .expect(200);
    expect((res.body as Balance).remainingDays).toBe(15);
  });

  it('POST /timeoff/request rejects invalid date format with 400', async () => {
    await request(app.getHttpServer())
      .post('/timeoff/request')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '05/01/2026',
        endDate: '2026-05-03',
        daysRequested: 3,
      })
      .expect(400);
  });

  it('POST /timeoff/:id/approve approves and decrements the balance', async () => {
    const create = await request(app.getHttpServer())
      .post('/timeoff/request')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
        daysRequested: 4,
      })
      .expect(201);
    const id = (create.body as TimeOffRequest).id;

    const approved = await request(app.getHttpServer())
      .post(`/timeoff/${id}/approve`)
      .send({ managerId: 'mgr-1' })
      .expect(201);

    const body = approved.body as TimeOffRequest;
    expect(body.status).toBe(TimeOffStatus.APPROVED);
    expect(body.managerId).toBe('mgr-1');

    const balance = await request(app.getHttpServer())
      .get('/balances/emp-1/loc-1')
      .expect(200);
    expect((balance.body as Balance).remainingDays).toBe(11);
  });

  it('POST /timeoff/:id/approve a second time returns 400', async () => {
    const create = await request(app.getHttpServer())
      .post('/timeoff/request')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
        daysRequested: 4,
      })
      .expect(201);
    const id = (create.body as TimeOffRequest).id;

    await request(app.getHttpServer())
      .post(`/timeoff/${id}/approve`)
      .send({ managerId: 'mgr-1' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/timeoff/${id}/approve`)
      .send({ managerId: 'mgr-2' })
      .expect(400);
  });

  it('POST /timeoff/:id/reject persists managerId and reason without touching balance', async () => {
    const create = await request(app.getHttpServer())
      .post('/timeoff/request')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
        daysRequested: 4,
      })
      .expect(201);
    const id = (create.body as TimeOffRequest).id;

    const rejected = await request(app.getHttpServer())
      .post(`/timeoff/${id}/reject`)
      .send({ managerId: 'mgr-1', reason: 'peak season' })
      .expect(201);

    const body = rejected.body as TimeOffRequest;
    expect(body.status).toBe(TimeOffStatus.REJECTED);
    expect(body.managerId).toBe('mgr-1');
    expect(body.rejectionReason).toBe('peak season');

    const balance = await request(app.getHttpServer())
      .get('/balances/emp-1/loc-1')
      .expect(200);
    expect((balance.body as Balance).remainingDays).toBe(15);
  });

  it('POST /timeoff/:id/approve returns 400 when body is missing managerId', async () => {
    const create = await request(app.getHttpServer())
      .post('/timeoff/request')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2026-05-01',
        endDate: '2026-05-04',
        daysRequested: 4,
      })
      .expect(201);
    const id = (create.body as TimeOffRequest).id;

    await request(app.getHttpServer())
      .post(`/timeoff/${id}/approve`)
      .send({})
      .expect(400);
  });

  it('POST /timeoff/:id/approve on missing id returns 404', async () => {
    await request(app.getHttpServer())
      .post('/timeoff/00000000-0000-4000-8000-000000000000/approve')
      .send({ managerId: 'mgr-1' })
      .expect(404);
  });
});
