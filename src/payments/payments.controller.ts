import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { SimulatePaymentDto } from './dto/simulate-payment.dto';
import { PaymentCheckoutSimulator } from './payment-checkout-simulator';
import {
  PaymentWebhookService,
  WebhookResponse,
} from './payment-webhook.service';
import { SIGNATURE_HEADER } from './webhook-signature';

const WEBHOOK_RESPONSE_DESCRIPTION =
  '{ status: "processed", outcome } | { status: "duplicate" } | { status: "ignored" }';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly webhooks: PaymentWebhookService,
    private readonly simulator: PaymentCheckoutSimulator,
  ) {}

  // Public: the provider authenticates with the HMAC signature, not a JWT.
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Payment provider webhook',
    description:
      'Verifies the HMAC signature of the raw body, then applies the event once: redelivering the same eventId changes nothing.',
  })
  @ApiHeader({
    name: SIGNATURE_HEADER,
    required: true,
    description:
      'sha256=<hex HMAC-SHA256 of the raw request body with PAYMENT_WEBHOOK_SECRET>',
  })
  @ApiBody({ type: PaymentWebhookDto })
  @ApiOkResponse({ description: WEBHOOK_RESPONSE_DESCRIPTION })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid signature' })
  @ApiBadRequestResponse({ description: 'Signed body is not a valid event' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers(SIGNATURE_HEADER) signature?: string,
  ): Promise<WebhookResponse> {
    return this.webhooks.handle(req.rawBody, signature);
  }

  @Post(':reference/simulate')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.BUYER)
  @ApiOperation({
    summary: 'Simulated provider checkout',
    description:
      'Signs a payment.updated event for one of your payments and delivers it through the webhook path.',
  })
  @ApiOkResponse({ description: WEBHOOK_RESPONSE_DESCRIPTION })
  simulate(
    @Param('reference') reference: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SimulatePaymentDto,
  ): Promise<WebhookResponse> {
    return this.simulator.simulate(reference, user.id, dto);
  }
}
