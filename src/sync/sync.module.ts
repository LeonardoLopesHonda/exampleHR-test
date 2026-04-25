import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Balance } from '../balance/balance.entity';
import { HcmModule } from '../hcm/hcm.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [HcmModule, TypeOrmModule.forFeature([Balance])],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
