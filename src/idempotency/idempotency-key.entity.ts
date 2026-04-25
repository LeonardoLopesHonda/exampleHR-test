import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('idempotency_keys')
@Index(['key', 'method', 'path'], { unique: true })
export class IdempotencyKey {
  @PrimaryColumn({ type: 'text' })
  key: string;

  @PrimaryColumn({ type: 'text' })
  method: string;

  @PrimaryColumn({ type: 'text' })
  path: string;

  @Column({ type: 'text' })
  requestHash: string;

  @Column({ type: 'integer' })
  responseStatus: number;

  @Column({ type: 'text' })
  responseBody: string;

  @Column({ type: 'integer' })
  createdAt: number;
}
