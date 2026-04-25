import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { HcmPermanentError, HcmTransientError } from './hcm.errors';

export interface HcmApprovalPayload {
  requestId: string;
  employeeId: string;
  locationId: string;
  daysRequested: number;
  managerId: string;
}

export interface HcmApprovalResult {
  hcmReferenceId: string;
}

export interface HcmBalanceSnapshot {
  employeeId: string;
  locationId: string;
  totalDays: number;
  remainingDays: number;
}

export type HcmProgrammedResult = 'success' | 'transient' | 'permanent';

@Injectable()
export class HcmMockClient {
  private programmed: HcmProgrammedResult[] = [];
  private programmedBalances: HcmBalanceSnapshot[] = [];

  setNextResults(results: HcmProgrammedResult[]): void {
    this.programmed = [...results];
  }

  clearProgrammed(): void {
    this.programmed = [];
  }

  setProgrammedBalances(balances: HcmBalanceSnapshot[]): void {
    this.programmedBalances = [...balances];
  }

  submitApproval(_payload: HcmApprovalPayload): Promise<HcmApprovalResult> {
    const next = this.programmed.shift() ?? 'success';
    if (next === 'transient') {
      return Promise.reject(
        new HcmTransientError('HCM transient failure (programmed)'),
      );
    }
    if (next === 'permanent') {
      return Promise.reject(
        new HcmPermanentError('HCM permanent failure (programmed)'),
      );
    }
    return Promise.resolve({ hcmReferenceId: randomUUID() });
  }

  getBalances(): Promise<HcmBalanceSnapshot[]> {
    const result = this.programmedBalances;
    this.programmedBalances = [];
    return Promise.resolve(result);
  }
}
