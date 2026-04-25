import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetryJob } from './retry-job.entity';
import { RetryService } from './retry.service';

@Module({
  imports: [TypeOrmModule.forFeature([RetryJob])],
  providers: [RetryService],
  exports: [RetryService],
})
export class RetryModule {}
