import { Controller, Get, Inject, NotFoundException, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { API_CONFIG, type ApiConfig } from './config';

/**
 * Apple fetches this document directly (without a redirect) to validate the Universal Link used
 * by WeChat. It intentionally contains no account data or secret and is only enabled when the
 * complete production WeChat configuration exists.
 */
@Controller('.well-known')
export class WechatUniversalLinkController {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  @Get('apple-app-site-association')
  association(@Res({ passthrough: true }) reply: FastifyReply) {
    const teamId = this.config.appleTeamId?.trim();
    const bundleId = this.config.appleIapBundleId?.trim();
    const universalLink = this.config.wechatUniversalLink?.trim();
    if (!teamId || !bundleId || !universalLink) throw new NotFoundException('wechat_login_not_configured');

    const pathname = new URL(universalLink).pathname;
    reply
      .header('content-type', 'application/json')
      .header('cache-control', 'public, max-age=300');
    return {
      applinks: {
        apps: [],
        details: [{
          appID: `${teamId}.${bundleId}`,
          paths: [`${pathname}*`],
        }],
      },
    };
  }
}
