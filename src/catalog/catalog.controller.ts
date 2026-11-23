import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { CatalogExceptionFilter } from './catalog-exception.filter';
import { CatalogNormalizerService } from './catalog-normalizer.service';
import { NormalizeProductDto } from './dto/normalize-product.dto';
import { NormalizeResponseDto } from './dto/normalize-response.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
@UseFilters(CatalogExceptionFilter)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly normalizer: CatalogNormalizerService) {}

  /** Proposes a normalized product for a raw line. It never creates or modifies products. */
  @Post('normalize')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NormalizeResponseDto })
  @ApiBadGatewayResponse({
    description:
      'The model rejected the request or returned invalid output (the body then includes runId)',
  })
  @ApiServiceUnavailableResponse({
    description: 'The model is unavailable; see the Retry-After header',
  })
  normalize(
    @CurrentUser() user: AuthUser,
    @Body() dto: NormalizeProductDto,
  ): Promise<NormalizeResponseDto> {
    return this.normalizer.normalize(user.id, dto.rawText, dto.promptVersion);
  }
}
