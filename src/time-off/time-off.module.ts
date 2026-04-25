import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceModule } from '../balance/balance.module';
import { HcmModule } from '../hcm/hcm.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { RetryModule } from '../retry/retry.module';
import { TimeOffController } from './time-off.controller';
import { TimeOffRequest } from './time-off.entity';
import { TimeOffService } from './time-off.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimeOffRequest]),
    BalanceModule,
    HcmModule,
    IdempotencyModule,
    RetryModule,
  ],
  controllers: [TimeOffController],
  providers: [TimeOffService],
  exports: [TimeOffService],
})
export class TimeOffModule {}
