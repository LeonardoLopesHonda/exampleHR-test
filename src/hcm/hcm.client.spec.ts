import { HcmMockClient } from './hcm.client';
import { HcmPermanentError, HcmTransientError } from './hcm.errors';

describe('HcmMockClient', () => {
  let client: HcmMockClient;
  beforeEach(() => {
    client = new HcmMockClient();
  });

  const payload = {
    requestId: 'req-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    daysRequested: 3,
    managerId: 'mgr-1',
  };

  it('returns a hcmReferenceId by default', async () => {
    const result = await client.submitApproval(payload);
    expect(result.hcmReferenceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('consumes programmed results in order', async () => {
    client.setNextResults(['transient', 'transient', 'success']);
    await expect(client.submitApproval(payload)).rejects.toBeInstanceOf(HcmTransientError);
    await expect(client.submitApproval(payload)).rejects.toBeInstanceOf(HcmTransientError);
    await expect(client.submitApproval(payload)).resolves.toEqual({
      hcmReferenceId: expect.any(String),
    });
  });

  it('throws HcmPermanentError when programmed', async () => {
    client.setNextResults(['permanent']);
    await expect(client.submitApproval(payload)).rejects.toBeInstanceOf(HcmPermanentError);
  });

  it('falls back to default success after the program is exhausted', async () => {
    client.setNextResults(['transient']);
    await expect(client.submitApproval(payload)).rejects.toBeInstanceOf(HcmTransientError);
    await expect(client.submitApproval(payload)).resolves.toEqual({
      hcmReferenceId: expect.any(String),
    });
  });

  it('clearProgrammed resets the queue', async () => {
    client.setNextResults(['transient']);
    client.clearProgrammed();
    await expect(client.submitApproval(payload)).resolves.toEqual({
      hcmReferenceId: expect.any(String),
    });
  });
});
