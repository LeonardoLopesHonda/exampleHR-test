import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from './balance.entity';
import { BalanceModule } from './balance.module';
import { BalanceService } from './balance.service';

describe('BalanceService (integration)', () => {
  let service: BalanceService;
  let repo: Repository<Balance>;

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
});
