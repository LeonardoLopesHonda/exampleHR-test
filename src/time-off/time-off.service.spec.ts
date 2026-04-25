import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from '../balance/balance.entity';
import { BalanceService } from '../balance/balance.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { TimeOffRequest, TimeOffStatus } from './time-off.entity';
import { TimeOffService } from './time-off.service';

describe('TimeOffService', () => {
  let service: TimeOffService;
  let repo: jest.Mocked<Repository<TimeOffRequest>>;
  let balanceService: jest.Mocked<BalanceService>;

  const balance: Balance = {
    employeeId: 'emp-1',
    locationId: 'loc-1',
    totalDays: 20,
    remainingDays: 10,
  };

  const validDto: CreateTimeOffRequestDto = {
    employeeId: 'emp-1',
    locationId: 'loc-1',
    startDate: '2026-05-01',
    endDate: '2026-05-05',
    daysRequested: 5,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TimeOffService,
        {
          provide: getRepositoryToken(TimeOffRequest),
          useValue: {
            save: jest.fn((entity) => Promise.resolve(entity)),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: BalanceService,
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(TimeOffService);
    repo = module.get(getRepositoryToken(TimeOffRequest));
    balanceService = module.get(BalanceService);
  });

  describe('create', () => {
    it('creates a PENDING request when balance is sufficient', async () => {
      balanceService.findOne.mockResolvedValue(balance);

      const result = await service.create(validDto);

      expect(result.status).toBe(TimeOffStatus.PENDING);
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(result.employeeId).toBe('emp-1');
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects when daysRequested exceeds remainingDays', async () => {
      balanceService.findOne.mockResolvedValue({
        ...balance,
        remainingDays: 3,
      });

      await expect(service.create(validDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects when no balance row exists (NotFound surfaces as BadRequest)', async () => {
      balanceService.findOne.mockRejectedValue(new NotFoundException());

      await expect(service.create(validDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects when endDate is before startDate', async () => {
      balanceService.findOne.mockResolvedValue(balance);
      const bad = {
        ...validDto,
        startDate: '2026-05-10',
        endDate: '2026-05-05',
      };

      await expect(service.create(bad)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('does not decrement the balance', async () => {
      balanceService.findOne.mockResolvedValue(balance);

      await service.create(validDto);

      // balanceService only exposes findOne; no update method should be called.
      expect(Object.keys(balanceService)).toEqual(['findOne']);
    });
  });

  describe('findOne', () => {
    it('returns the request when found', async () => {
      const stored: TimeOffRequest = {
        id: 'req-1',
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2026-05-01',
        endDate: '2026-05-05',
        daysRequested: 5,
        status: TimeOffStatus.PENDING,
        managerId: null,
      };
      repo.findOne.mockResolvedValue(stored);

      const result = await service.findOne('req-1');

      expect(result).toEqual(stored);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'req-1' } });
    });

    it('throws NotFoundException when missing', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findByEmployee', () => {
    it('returns all requests for an employee', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.findByEmployee('emp-1');

      expect(result).toEqual([]);
      expect(repo.find).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1' },
      });
    });
  });
});
