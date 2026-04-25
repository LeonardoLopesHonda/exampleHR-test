import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BalanceModule } from './balance/balance.module';
import { Balance } from './balance/balance.entity';
import { IdempotencyKey } from './idempotency/idempotency-key.entity';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { RetryJob } from './retry/retry-job.entity';
import { RetryModule } from './retry/retry.module';
import { SyncModule } from './sync/sync.module';
import { TimeOffModule } from './time-off/time-off.module';
import { TimeOffRequest } from './time-off/time-off.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'database.sqlite',
      entities: [Balance, TimeOffRequest, IdempotencyKey, RetryJob],
      synchronize: true,
    }),
    BalanceModule,
    IdempotencyModule,
    RetryModule,
    SyncModule,
    TimeOffModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
