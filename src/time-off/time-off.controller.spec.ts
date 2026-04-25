import { Test } from '@nestjs/testing';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { TimeOffStatus } from './time-off.entity';
import { TimeOffController } from './time-off.controller';
import { TimeOffService } from './time-off.service';

describe('TimeOffController', () => {
  let controller: TimeOffController;
  let service: jest.Mocked<TimeOffService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TimeOffController],
      providers: [
        {
          provide: TimeOffService,
          useValue: {
            create: jest.fn(),
            findOne: jest.fn(),
            findByEmployee: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(TimeOffController);
    service = module.get(TimeOffService);
  });

  it('POST /timeoff/request delegates to service.create', async () => {
    const dto: CreateTimeOffRequestDto = {
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
      daysRequested: 5,
    };
    const stored = {
      id: 'req-1',
      ...dto,
      status: TimeOffStatus.PENDING,
      managerId: null,
      rejectionReason: null,
    };
    service.create.mockResolvedValue(stored);

    const result = await controller.create(dto);

    expect(result).toEqual(stored);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('GET /timeoff/:id delegates to service.findOne', async () => {
    const stored = {
      id: 'req-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
      daysRequested: 5,
      status: TimeOffStatus.PENDING,
      managerId: null,
      rejectionReason: null,
    };
    service.findOne.mockResolvedValue(stored);

    const result = await controller.findOne('req-1');

    expect(result).toEqual(stored);
    expect(service.findOne).toHaveBeenCalledWith('req-1');
  });

  it('GET /timeoff?employeeId=... delegates to service.findByEmployee', async () => {
    service.findByEmployee.mockResolvedValue([]);

    const result = await controller.findByEmployee('emp-1');

    expect(result).toEqual([]);
    expect(service.findByEmployee).toHaveBeenCalledWith('emp-1');
  });
});
