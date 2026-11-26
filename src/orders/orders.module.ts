import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../payments/payment.entity';
import { PaymentsModule } from '../payments/payments.module';
import { OrderEventsLogger } from './order-events.logger';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { SubOrder } from './sub-order.entity';
import { SubOrdersController } from './sub-orders.controller';
import { SubOrdersService } from './sub-orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, SubOrder, Payment]),
    PaymentsModule,
  ],
  controllers: [OrdersController, SubOrdersController],
  providers: [OrdersService, SubOrdersService, OrderEventsLogger],
})
export class OrdersModule {}
