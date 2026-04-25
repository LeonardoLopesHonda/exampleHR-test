import { Module } from '@nestjs/common';
import { HcmMockClient } from './hcm.client';

@Module({
  providers: [HcmMockClient],
  exports: [HcmMockClient],
})
export class HcmModule {}
