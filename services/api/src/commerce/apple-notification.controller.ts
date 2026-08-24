import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';

import { appleNotificationV2Schema } from './commerce.schemas';
import { CommerceService } from './commerce.service';

/**
 * Public App Store Server Notifications V2 receiver. Authenticity and app
 * ownership are established exclusively by Apple's signedPayload chain, not
 * by an application bearer token.
 */
@Controller('v1/commerce/apple/notifications')
export class AppleNotificationController {
  constructor(private readonly commerce: CommerceService) {}

  @Post('v2')
  @HttpCode(200)
  async receive(@Body() body: unknown) {
    const parsed = appleNotificationV2Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_apple_notification_request');
    await this.commerce.processAppleNotification(parsed.data.signedPayload);
    return { accepted: true };
  }
}
