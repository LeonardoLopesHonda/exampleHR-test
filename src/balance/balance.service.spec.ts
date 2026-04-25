import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
          useValue: { findOne: jest.fn(), save: jest.fn() },
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

  describe('decrement', () => {
    const existing: Balance = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 10,
    };

    it('subtracts days and saves via the injected repo when no manager is supplied', async () => {
      repo.findOne.mockResolvedValue({ ...existing });
      repo.save.mockImplementation(async (b) => b as Balance);

      const result = await service.decrement('emp-1', 'loc-1', 3);

      expect(result.remainingDays).toBe(7);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ remainingDays: 7 }),
      );
    });

    it('uses the provided EntityManager repo when one is supplied', async () => {
      const txnRepo = {
        findOne: jest.fn().mockResolvedValue({ ...existing }),
        save: jest.fn().mockImplementation(async (b) => b),
      };
      const manager = {
        getRepository: jest.fn().mockReturnValue(txnRepo),
      } as unknown as EntityManager;

      const result = await service.decrement('emp-1', 'loc-1', 4, manager);

      expect(result.remainingDays).toBe(6);
      expect(manager.getRepository).toHaveBeenCalledWith(Balance);
      expect(txnRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ remainingDays: 6 }),
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when remainingDays is below days', async () => {
      repo.findOne.mockResolvedValue({ ...existing, remainingDays: 2 });

      await expect(service.decrement('emp-1', 'loc-1', 5)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the balance row is missing', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.decrement('emp-1', 'loc-1', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
