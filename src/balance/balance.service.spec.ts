import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from './balance.entity';
import { BalanceService } from './balance.service';

describe('BalanceService', () => {
  let service: BalanceService;
  let repo: jest.Mocked<Repository<Balance>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BalanceService,
        {
          provide: getRepositoryToken(Balance),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(BalanceService);
    repo = module.get(getRepositoryToken(Balance));
  });

  it('returns the balance when one exists', async () => {
    const balance: Balance = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 15,
    };
    repo.findOne.mockResolvedValue(balance);

    const result = await service.findOne('emp-1', 'loc-1');

    expect(result).toEqual(balance);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { employeeId: 'emp-1', locationId: 'loc-1' },
    });
  });

  it('throws NotFoundException when no balance exists', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.findOne('emp-1', 'loc-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
