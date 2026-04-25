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

export type HcmProgrammedResult = 'success' | 'transient' | 'permanent';

@Injectable()
export class HcmMockClient {
  private programmed: HcmProgrammedResult[] = [];

  setNextResults(results: HcmProgrammedResult[]): void {
    this.programmed = [...results];
  }

  clearProgrammed(): void {
    this.programmed = [];
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
}
