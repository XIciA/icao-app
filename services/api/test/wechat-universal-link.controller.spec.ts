import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from '../src/config';
import { WechatUniversalLinkController } from '../src/wechat-universal-link.controller';

function replyRecorder() {
  const headers = new Map<string, string>();
  const reply = {
    header: vi.fn((name: string, value: string) => {
      headers.set(name, value);
      return reply;
    }),
  };
  return { headers, reply };
}

describe('WechatUniversalLinkController', () => {
  it('serves a narrow AASA document with JSON content type and no redirect', () => {
    const config = {
      appleIapBundleId: 'com.readyoufife.ios',
      appleTeamId: 'TEAM123456',
      wechatUniversalLink: 'https://api.example.com/wechat-auth/',
    } as ApiConfig;
    const controller = new WechatUniversalLinkController(config);
    const { headers, reply } = replyRecorder();

    expect(controller.association(reply as never)).toEqual({
      applinks: {
        apps: [],
        details: [{
          appID: 'TEAM123456.com.readyoufife.ios',
          paths: ['/wechat-auth/*'],
        }],
      },
    });
    expect(headers.get('content-type')).toBe('application/json');
    expect(reply.header).not.toHaveBeenCalledWith('location', expect.anything());
  });

  it('does not publish a misleading association before production configuration exists', () => {
    const controller = new WechatUniversalLinkController({} as ApiConfig);
    expect(() => controller.association(replyRecorder().reply as never)).toThrow(NotFoundException);
  });
});
