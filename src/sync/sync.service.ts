import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from '../balance/balance.entity';
import { HcmBalanceSnapshot, HcmMockClient } from '../hcm/hcm.client';

export interface SyncFailure {
  employeeId: string;
  locationId: string;
  error: string;
}

export interface SyncSummary {
  synced: number;
  skipped: number;
  failed: SyncFailure[];
}

@Injectable()
export class SyncService {
  constructor(
    private readonly hcmClient: HcmMockClient,
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
  ) {}

  async runBatchSync(): Promise<SyncSummary> {
    const snapshots = await this.hcmClient.getBalances();
    let synced = 0;
    let skipped = 0;
    const failed: SyncFailure[] = [];

    for (const snapshot of snapshots) {
      try {
        const local = await this.balanceRepository.findOne({
          where: {
            employeeId: snapshot.employeeId,
            locationId: snapshot.locationId,
          },
        });
        if (
          local &&
          local.totalDays === snapshot.totalDays &&
          local.remainingDays === snapshot.remainingDays
        ) {
          skipped++;
          continue;
        }
        const toSave: HcmBalanceSnapshot = local
          ? {
              ...local,
              totalDays: snapshot.totalDays,
              remainingDays: snapshot.remainingDays,
            }
          : snapshot;
        await this.balanceRepository.save(toSave);
        synced++;
      } catch (err) {
        failed.push({
          employeeId: snapshot.employeeId,
          locationId: snapshot.locationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { synced, skipped, failed };
  }
}
