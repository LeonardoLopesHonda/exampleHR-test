import { Test } from '@nestjs/testing';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ApproveTimeOffRequestDto } from './dto/approve-time-off-request.dto';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { RejectTimeOffRequestDto } from './dto/reject-time-off-request.dto';
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
            approve: jest.fn(),
            reject: jest.fn(),
          },
        },
        { provide: IdempotencyService, useValue: {} },
        { provide: IdempotencyInterceptor, useValue: {} },
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

  it('POST /timeoff/:id/approve delegates to service.approve', async () => {
    const dto: ApproveTimeOffRequestDto = { managerId: 'mgr-1' };
    const stored = {
      id: 'req-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
      daysRequested: 5,
      status: TimeOffStatus.APPROVED,
      managerId: 'mgr-1',
      rejectionReason: null,
    };
    service.approve.mockResolvedValue(stored);

    const result = await controller.approve('req-1', dto);

    expect(result).toEqual(stored);
    expect(service.approve).toHaveBeenCalledWith('req-1', dto);
  });

  it('POST /timeoff/:id/reject delegates to service.reject', async () => {
    const dto: RejectTimeOffRequestDto = {
      managerId: 'mgr-1',
      reason: 'overlap',
    };
    const stored = {
      id: 'req-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
      daysRequested: 5,
      status: TimeOffStatus.REJECTED,
      managerId: 'mgr-1',
      rejectionReason: 'overlap',
    };
    service.reject.mockResolvedValue(stored);

    const result = await controller.reject('req-1', dto);

    expect(result).toEqual(stored);
    expect(service.reject).toHaveBeenCalledWith('req-1', dto);
  });
});
