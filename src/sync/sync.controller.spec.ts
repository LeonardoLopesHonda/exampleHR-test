import { Test } from '@nestjs/testing';
import { SyncController } from './sync.controller';
import { SyncService, SyncSummary } from './sync.service';

describe('SyncController', () => {
  let controller: SyncController;
  let syncService: { runBatchSync: jest.Mock };

  beforeEach(async () => {
    syncService = { runBatchSync: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [{ provide: SyncService, useValue: syncService }],
    }).compile();
    controller = module.get(SyncController);
  });

  it('delegates to runBatchSync and returns the summary', async () => {
    const summary: SyncSummary = { synced: 2, skipped: 1, failed: [] };
    syncService.runBatchSync.mockResolvedValue(summary);

    const result = await controller.batchSync();

    expect(result).toEqual(summary);
    expect(syncService.runBatchSync).toHaveBeenCalledTimes(1);
  });
});
