import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentStatus } from '../../domain/payment-status.enum';

export const PAYMENT_UPDATED = 'payment.updated';
export const FINAL_PAYMENT_STATUSES = [
  PaymentStatus.APPROVED,
  PaymentStatus.REJECTED,
] as const;
export type FinalPaymentStatus = (typeof FINAL_PAYMENT_STATUSES)[number];

export class PaymentWebhookDataDto {
  @ApiProperty({ example: 'fake-3f1c8a4e-2d7b-4c55-9a51-0d6c2b9f7e10' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reference!: string;

  @ApiProperty({ enum: FINAL_PAYMENT_STATUSES })
  @IsIn(FINAL_PAYMENT_STATUSES)
  status!: FinalPaymentStatus;
}

export class PaymentWebhookDto {
  @ApiProperty({
    description: 'Unique per event; a redelivered event keeps its id.',
    example: 'evt-6b2f0c1e',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  eventId!: string;

  @ApiProperty({ enum: [PAYMENT_UPDATED] })
  @IsIn([PAYMENT_UPDATED])
  type!: typeof PAYMENT_UPDATED;

  @ApiProperty({ type: PaymentWebhookDataDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentWebhookDataDto)
  data!: PaymentWebhookDataDto;
}
