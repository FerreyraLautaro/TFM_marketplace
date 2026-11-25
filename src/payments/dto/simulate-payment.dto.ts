import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  FINAL_PAYMENT_STATUSES,
  FinalPaymentStatus,
} from './payment-webhook.dto';

export class SimulatePaymentDto {
  @ApiProperty({ enum: FINAL_PAYMENT_STATUSES })
  @IsIn(FINAL_PAYMENT_STATUSES)
  status!: FinalPaymentStatus;

  @ApiPropertyOptional({
    description:
      'Reuse an event id to redeliver the same event (shows idempotency). Random when omitted.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  eventId?: string;
}
