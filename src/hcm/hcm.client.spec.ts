import { HcmMockClient, HcmApprovalPayload } from './hcm.client';

describe('HcmMockClient', () => {
  let client: HcmMockClient;

  beforeEach(() => {
    client = new HcmMockClient();
  });

  it('returns a UUID-shaped hcmReferenceId for a valid payload', async () => {
    const payload: HcmApprovalPayload = {
      requestId: 'req-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      daysRequested: 5,
      managerId: 'mgr-1',
    };

    const result = await client.submitApproval(payload);

    expect(result.hcmReferenceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('returns a fresh hcmReferenceId on each call', async () => {
    const payload: HcmApprovalPayload = {
      requestId: 'req-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      daysRequested: 5,
      managerId: 'mgr-1',
    };

    const a = await client.submitApproval(payload);
    const b = await client.submitApproval(payload);

    expect(a.hcmReferenceId).not.toBe(b.hcmReferenceId);
  });
});
