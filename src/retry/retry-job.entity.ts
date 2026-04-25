import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export enum RetryJobType {
  HCM_APPROVAL = 'HCM_APPROVAL',
  LOCAL_BALANCE_APPLY = 'LOCAL_BALANCE_APPLY',
}

export enum RetryJobStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  EXHAUSTED = 'EXHAUSTED',
}

@Entity('retry_jobs')
export class RetryJob {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  jobType: RetryJobType;

  @Index()
  @Column({ type: 'text' })
  requestId: string;

  @Column({ type: 'text' })
  payload: string;

  @Column({ type: 'integer' })
  attempts: number;

  @Column({ type: 'integer' })
  maxAttempts: number;

  @Index()
  @Column({ type: 'integer' })
  nextAttemptAt: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Index()
  @Column({ type: 'text' })
  status: RetryJobStatus;

  @Column({ type: 'integer' })
  createdAt: number;

  @Column({ type: 'integer' })
  updatedAt: number;
}
