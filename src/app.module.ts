import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BalanceModule } from './balance/balance.module';
import { Balance } from './balance/balance.entity';
import { TimeOffModule } from './time-off/time-off.module';
import { TimeOffRequest } from './time-off/time-off.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'database.sqlite',
      entities: [Balance, TimeOffRequest],
      synchronize: true,
    }),
    BalanceModule,
    TimeOffModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
