import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyKey } from './idempotency-key.entity';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repo: jest.Mocked<Repository<IdempotencyKey>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: getRepositoryToken(IdempotencyKey),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(IdempotencyService);
    repo = module.get(getRepositoryToken(IdempotencyKey));
  });

  describe('lookup', () => {
    it('returns null when no row exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.lookup('k', 'POST', '/timeoff/request', 'hash-a');
      expect(result).toBeNull();
    });

    it('returns the stored row when hash matches', async () => {
      const row: IdempotencyKey = {
        key: 'k',
        method: 'POST',
        path: '/timeoff/request',
        requestHash: 'hash-a',
        responseStatus: 201,
        responseBody: '{"id":"req-1"}',
        createdAt: Date.now(),
      };
      repo.findOne.mockResolvedValue(row);
      const result = await service.lookup('k', 'POST', '/timeoff/request', 'hash-a');
      expect(result).toEqual(row);
    });

    it('throws ConflictException when hash differs (key reuse)', async () => {
      const row: IdempotencyKey = {
        key: 'k',
        method: 'POST',
        path: '/timeoff/request',
        requestHash: 'hash-a',
        responseStatus: 201,
        responseBody: '{}',
        createdAt: Date.now(),
      };
      repo.findOne.mockResolvedValue(row);
      await expect(
        service.lookup('k', 'POST', '/timeoff/request', 'hash-b'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('store', () => {
    it('persists the response keyed by (key, method, path)', async () => {
      repo.save.mockImplementation(async (e) => e as IdempotencyKey);
      await service.store('k', 'POST', '/timeoff/request', 'hash-a', 201, { id: 'req-1' });
      expect(repo.save).toHaveBeenCalledWith({
        key: 'k',
        method: 'POST',
        path: '/timeoff/request',
        requestHash: 'hash-a',
        responseStatus: 201,
        responseBody: '{"id":"req-1"}',
        createdAt: expect.any(Number),
      });
    });
  });
});
