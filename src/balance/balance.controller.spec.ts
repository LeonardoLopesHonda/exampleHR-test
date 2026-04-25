import { Test } from '@nestjs/testing';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';

describe('BalanceController', () => {
  let controller: BalanceController;
  let service: jest.Mocked<BalanceService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [BalanceController],
      providers: [
        { provide: BalanceService, useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    controller = module.get(BalanceController);
    service = module.get(BalanceService);
  });

  it('delegates GET /balances/:employeeId/:locationId to the service', async () => {
    const balance = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      totalDays: 20,
      remainingDays: 15,
    };
    service.findOne.mockResolvedValue(balance);

    const result = await controller.findOne('emp-1', 'loc-1');

    expect(result).toEqual(balance);
    expect(service.findOne).toHaveBeenCalledWith('emp-1', 'loc-1');
  });
});
