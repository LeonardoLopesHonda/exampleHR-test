import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Balance } from './balance.entity';
import { BalanceModule } from './balance.module';
import { BalanceService } from './balance.service';

describe('BalanceService (integration)', () => {
  let service: BalanceService;
  let repo: Repository<Balance>;
  let dataSource: DataSource;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Balance],
          synchronize: true,
        }),
        BalanceModule,
      ],
    }).compile();

    service = module.get(BalanceService);
    repo = module.get(getRepositoryToken(Balance));
    dataSource = module.get(DataSource);
  });

  it('reads a balance that was inserted directly via the repository', async () => {
    await repo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 15,
    });

    const result = await service.findOne('emp-1', 'loc-1');

    expect(result.remainingDays).toBe(15);
  });

  it('throws NotFoundException for missing balances', async () => {
    await expect(service.findOne('nope', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('decrement persists the new remainingDays', async () => {
    await repo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 10,
    });

    await service.decrement('emp-1', 'loc-1', 4);

    const after = await repo.findOne({
      where: { employeeId: 'emp-1', locationId: 'loc-1' },
    });
    expect(after?.remainingDays).toBe(6);
  });

  it('decrement inside a transaction shares the manager', async () => {
    await repo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 10,
    });

    await dataSource.transaction(async (manager) => {
      await service.decrement('emp-1', 'loc-1', 3, manager);
    });

    const after = await repo.findOne({
      where: { employeeId: 'emp-1', locationId: 'loc-1' },
    });
    expect(after?.remainingDays).toBe(7);
  });

  it('decrement rolls back when the surrounding transaction throws', async () => {
    await repo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 10,
    });

    await expect(
      dataSource.transaction(async (manager) => {
        await service.decrement('emp-1', 'loc-1', 3, manager);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const after = await repo.findOne({
      where: { employeeId: 'emp-1', locationId: 'loc-1' },
    });
    expect(after?.remainingDays).toBe(10);
  });

  it('decrement throws BadRequestException when balance is insufficient', async () => {
    await repo.save({
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 2,
    });

    await expect(service.decrement('emp-1', 'loc-1', 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const after = await repo.findOne({
      where: { employeeId: 'emp-1', locationId: 'loc-1' },
    });
    expect(after?.remainingDays).toBe(2);
  });
});
