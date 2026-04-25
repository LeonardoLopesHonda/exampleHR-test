import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export enum TimeOffStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

@Entity('time_off_requests')
export class TimeOffRequest {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Index()
  @Column({ type: 'text' })
  employeeId: string;

  @Column({ type: 'text' })
  locationId: string;

  @Column({ type: 'text' })
  startDate: string;

  @Column({ type: 'text' })
  endDate: string;

  @Column({ type: 'integer' })
  daysRequested: number;

  @Column({ type: 'text' })
  status: TimeOffStatus;

  @Column({ type: 'text', nullable: true })
  managerId: string | null;
}
