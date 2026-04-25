import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyKey } from './idempotency-key.entity';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repo: Repository<IdempotencyKey>,
  ) {}

  async lookup(
    key: string,
    method: string,
    path: string,
    requestHash: string,
  ): Promise<IdempotencyKey | null> {
    const row = await this.repo.findOne({ where: { key, method, path } });
    if (!row) return null;
    if (row.requestHash !== requestHash) {
      throw new ConflictException(
        `Idempotency-Key "${key}" reused with a different request body`,
      );
    }
    return row;
  }

  async store(
    key: string,
    method: string,
    path: string,
    requestHash: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.repo.save({
      key,
      method,
      path,
      requestHash,
      responseStatus,
      responseBody: JSON.stringify(responseBody),
      createdAt: Date.now(),
    });
  }
}
