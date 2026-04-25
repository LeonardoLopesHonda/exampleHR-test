import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from '../balance/balance.entity';
import { BalanceModule } from '../balance/balance.module';
import { TimeOffModule } from './time-off.module';
import { TimeOffRequest, TimeOffStatus } from './time-off.entity';
import { TimeOffService } from './time-off.service';

describe('TimeOffService (integration)', () => {
  let service: TimeOffService;
  let balanceRepo: Repository<Balance>;
  let requestRepo: Repository<TimeOffRequest>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Balance, TimeOffRequest],
          synchronize: true,
        }),
        BalanceModule,
        TimeOffModule,
      ],
    }).compile();

    service = module.get(TimeOffService);
    balanceRepo = module.get(getRepositoryToken(Balance));
    requestRepo = module.get(getRepositoryToken(TimeOffRequest));
  });

  it('creates a request, persists it, and decrements nothing (Phase 1 has no balance mutation)', async () => {
    await balanceRepo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 15,
    });

    const created = await service.create({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-03',
      daysRequested: 3,
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe(TimeOffStatus.PENDING);

    const fromDb = await requestRepo.findOne({ where: { id: created.id } });
    expect(fromDb).not.toBeNull();
    expect(fromDb!.employeeId).toBe('emp-1');
    expect(fromDb!.daysRequested).toBe(3);
  });

  it('rejects when daysRequested exceeds remainingDays', async () => {
    await balanceRepo.save({
      employeeId: 'emp-2',
      locationId: 'loc-1',
      totalDays: 10,
      remainingDays: 2,
    });

    await expect(
      service.create({
        employeeId: 'emp-2',
        locationId: 'loc-1',
        startDate: '2026-05-01',
        endDate: '2026-05-05',
        daysRequested: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when no balance exists for the employee/location', async () => {
    await expect(
      service.create({
        employeeId: 'ghost',
        locationId: 'loc-1',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        daysRequested: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findOne throws NotFoundException for missing id', async () => {
    await expect(service.findOne('does-not-exist')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("findByEmployee returns only that employee's requests", async () => {
    await balanceRepo.save({
      employeeId: 'emp-a',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 20,
    });
    await balanceRepo.save({
      employeeId: 'emp-b',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 20,
    });

    await service.create({
      employeeId: 'emp-a',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      daysRequested: 2,
    });
    await service.create({
      employeeId: 'emp-a',
      locationId: 'loc-1',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      daysRequested: 2,
    });
    await service.create({
      employeeId: 'emp-b',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      daysRequested: 2,
    });

    const aRequests = await service.findByEmployee('emp-a');
    expect(aRequests).toHaveLength(2);
    expect(aRequests.every((r) => r.employeeId === 'emp-a')).toBe(true);
  });
});
