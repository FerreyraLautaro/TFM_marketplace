import { IsEnum } from 'class-validator';
import { SubOrderStatus } from '../sub-order-status.enum';

export class ChangeSubOrderStatusDto {
  @IsEnum(SubOrderStatus)
  status!: SubOrderStatus;
}
