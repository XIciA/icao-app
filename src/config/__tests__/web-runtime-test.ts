/* eslint-disable @typescript-eslint/no-require-imports */

describe('Web runtime selection', () => {
  const original = process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;

  afterEach(() => {
    jest.resetModules();
    if (original === undefined) delete process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
    else process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = original;
  });

  it.each([undefined, '', 'unknown', 'edgeone-production'])('uses the formal web runtime for %s', (value) => {
    if (value === undefined) delete process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
    else process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = value;
    jest.isolateModules(() => {
      const runtime = require('../web-runtime') as typeof import('../web-runtime');
      expect(runtime.WEB_RUNTIME).toBe('edgeone-production');
      expect(runtime.isEdgeOneProductionWeb()).toBe(true);
      expect(runtime.isVercelLegacyWeb('web')).toBe(false);
      expect(runtime.isFormalAppSurface('web')).toBe(true);
      expect(runtime.isFormalAppSurface('ios')).toBe(true);
    });
  });

  it('retains the explicit legacy value for historical compatibility', () => {
    process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = 'vercel-legacy';
    jest.isolateModules(() => {
      const runtime = require('../web-runtime') as typeof import('../web-runtime');
      expect(runtime.WEB_RUNTIME).toBe('vercel-legacy');
      expect(runtime.isEdgeOneProductionWeb()).toBe(false);
      expect(runtime.isVercelLegacyWeb('web')).toBe(true);
      expect(runtime.isFormalAppSurface('web')).toBe(false);
    });
  });
});
