import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../auth/domain/auth-user';
import { CurrentUser } from '../../auth/http/decorators/current-user.decorator';
import { Roles } from '../../auth/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/http/guards/roles.guard';
import { PaymentSummary } from '../../payments/application/payment-summary';
import { UserRole } from '../../users/domain/user-role.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from '../domain/order.entity';
import { OrdersService } from '../application/orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BUYER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
  ): Promise<Order> {
    return this.ordersService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<Order[]> {
    return this.ordersService.findAllForBuyer(user.id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Order> {
    return this.ordersService.findOneForBuyer(id, user.id);
  }

  // Starts an asynchronous payment; the order becomes PAID when the provider
  // confirms it through the payment webhook.
  @Post(':id/pay')
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PaymentSummary> {
    return this.ordersService.pay(id, user.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Order> {
    return this.ordersService.cancel(id, user.id);
  }
}
