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
import { AuthUser } from '../../auth/domain/auth-user';
import { CurrentUser } from '../../auth/http/decorators/current-user.decorator';
import { Roles } from '../../auth/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/http/guards/roles.guard';
import { UserRole } from '../../users/domain/user-role.enum';
import { ChangeSubOrderStatusDto } from './dto/change-sub-order-status.dto';
import { SubOrder } from '../domain/sub-order.entity';
import { SubOrdersService } from '../application/sub-orders.service';

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
