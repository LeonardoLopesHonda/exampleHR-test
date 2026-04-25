import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

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

@Injectable()
export class HcmMockClient {
  submitApproval(_payload: HcmApprovalPayload): Promise<HcmApprovalResult> {
    return Promise.resolve({ hcmReferenceId: randomUUID() });
  }
}
