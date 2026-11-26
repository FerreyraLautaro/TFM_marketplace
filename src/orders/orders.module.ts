import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../payments/domain/payment.entity';
import { PaymentsModule } from '../payments/payments.module';
import { OrderEventsLogger } from './infrastructure/order-events.logger';
import { Order } from './domain/order.entity';
import { OrdersController } from './http/orders.controller';
import { OrdersService } from './application/orders.service';
import { SubOrder } from './domain/sub-order.entity';
import { SubOrdersController } from './http/sub-orders.controller';
import { SubOrdersService } from './application/sub-orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, SubOrder, Payment]),
    PaymentsModule,
  ],
  controllers: [OrdersController, SubOrdersController],
  providers: [OrdersService, SubOrdersService, OrderEventsLogger],
})
export class OrdersModule {}
