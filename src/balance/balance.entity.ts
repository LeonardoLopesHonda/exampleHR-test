import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('balances')
export class Balance {
  @PrimaryColumn({ type: 'text' })
  employeeId: string;

  @PrimaryColumn({ type: 'text' })
  locationId: string;

  @Column({ type: 'integer' })
  totalDays: number;

  @Column({ type: 'integer' })
  remainingDays: number;
}
