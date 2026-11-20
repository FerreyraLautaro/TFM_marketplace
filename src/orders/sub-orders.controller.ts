import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { ChangeSubOrderStatusDto } from './dto/change-sub-order-status.dto';
import { SubOrder } from './sub-order.entity';
import { SubOrdersService } from './sub-orders.service';

@ApiTags('sub-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
@Controller('sub-orders')
export class SubOrdersController {
  constructor(private readonly subOrdersService: SubOrdersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<SubOrder[]> {
    return this.subOrdersService.findAllForSeller(user.id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SubOrder> {
    return this.subOrdersService.findOneForSeller(id, user.id);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeSubOrderStatusDto,
  ): Promise<SubOrder> {
    return this.subOrdersService.changeStatus(id, user.id, dto.status);
  }
}
