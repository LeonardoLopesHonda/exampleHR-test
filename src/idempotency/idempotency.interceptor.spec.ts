import { ConflictException, ExecutionContext, CallHandler } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { lastValueFrom, of, throwError } from 'rxjs';
import { IdempotencyKey } from './idempotency-key.entity';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

function makeContext(
  headers: Record<string, string>,
  body: unknown,
  method = 'POST',
  path = '/timeoff/request',
) {
  const req: any = { headers, body, method, route: { path } };
  const res: any = { statusCode: 201, status: jest.fn().mockReturnThis() };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let service: jest.Mocked<IdempotencyService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        {
          provide: IdempotencyService,
          useValue: { lookup: jest.fn(), store: jest.fn() },
        },
      ],
    }).compile();

    interceptor = module.get(IdempotencyInterceptor);
    service = module.get(IdempotencyService);
  });

  it('bypasses when header is absent', async () => {
    const ctx = makeContext({}, { foo: 1 });
    const next: CallHandler = { handle: () => of({ id: 'req-1' }) };
    const result = await lastValueFrom(interceptor.intercept(ctx, next));
    expect(result).toEqual({ id: 'req-1' });
    expect(service.lookup).not.toHaveBeenCalled();
    expect(service.store).not.toHaveBeenCalled();
  });

  it('returns the cached body when key + body hash match', async () => {
    const cached: IdempotencyKey = {
      key: 'k',
      method: 'POST',
      path: '/timeoff/request',
      requestHash: 'will-be-overwritten',
      responseStatus: 201,
      responseBody: JSON.stringify({ id: 'cached-req' }),
      createdAt: 0,
    };
    service.lookup.mockResolvedValue(cached);
    const ctx = makeContext({ 'idempotency-key': 'k' }, { foo: 1 });
    const handlerSpy = jest.fn(() => of({ id: 'fresh' }));
    const next: CallHandler = { handle: handlerSpy };
    const result = await lastValueFrom(interceptor.intercept(ctx, next));
    expect(result).toEqual({ id: 'cached-req' });
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('propagates ConflictException when service detects key reuse', async () => {
    service.lookup.mockRejectedValue(new ConflictException('reused'));
    const ctx = makeContext({ 'idempotency-key': 'k' }, { foo: 1 });
    const next: CallHandler = { handle: () => of({ id: 'never' }) };
    await expect(
      lastValueFrom(interceptor.intercept(ctx, next)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores 2xx responses and returns the fresh body', async () => {
    service.lookup.mockResolvedValue(null);
    const ctx = makeContext({ 'idempotency-key': 'k' }, { foo: 1 });
    const next: CallHandler = { handle: () => of({ id: 'fresh' }) };
    const result = await lastValueFrom(interceptor.intercept(ctx, next));
    expect(result).toEqual({ id: 'fresh' });
    expect(service.store).toHaveBeenCalledWith(
      'k',
      'POST',
      '/timeoff/request',
      expect.any(String),
      201,
      { id: 'fresh' },
    );
  });

  it('does NOT store on handler error', async () => {
    service.lookup.mockResolvedValue(null);
    const ctx = makeContext({ 'idempotency-key': 'k' }, { foo: 1 });
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };
    await expect(lastValueFrom(interceptor.intercept(ctx, next))).rejects.toThrow(
      'boom',
    );
    expect(service.store).not.toHaveBeenCalled();
  });
});
