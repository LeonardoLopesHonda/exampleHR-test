import { Controller, Post } from '@nestjs/common';
import { SyncService, SyncSummary } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('batch')
  batchSync(): Promise<SyncSummary> {
    return this.syncService.runBatchSync();
  }
}
