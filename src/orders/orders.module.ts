import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { SubOrder } from './sub-order.entity';
import { SubOrdersController } from './sub-orders.controller';
import { SubOrdersService } from './sub-orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, SubOrder])],
  controllers: [OrdersController, SubOrdersController],
  providers: [OrdersService, SubOrdersService],
})
export class OrdersModule {}
