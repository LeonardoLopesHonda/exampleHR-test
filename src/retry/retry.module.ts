import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceModule } from '../balance/balance.module';
import { HcmModule } from '../hcm/hcm.module';
import { TimeOffRequest } from '../time-off/time-off.entity';
import { RetryJob } from './retry-job.entity';
import { RetryService } from './retry.service';
import { RetryWorker } from './retry.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([RetryJob, TimeOffRequest]),
    BalanceModule,
    HcmModule,
  ],
  providers: [RetryService, RetryWorker],
  exports: [RetryService],
})
export class RetryModule {}
