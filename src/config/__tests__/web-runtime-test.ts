/* eslint-disable @typescript-eslint/no-require-imports */

describe('Web runtime selection', () => {
  const original = process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;

  afterEach(() => {
    jest.resetModules();
    if (original === undefined) delete process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
    else process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = original;
  });

  it('keeps the existing Vercel runtime as the safe default', () => {
    delete process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME;
    jest.isolateModules(() => {
      const runtime = require('../web-runtime') as typeof import('../web-runtime');
      expect(runtime.WEB_RUNTIME).toBe('vercel-legacy');
      expect(runtime.isEdgeOneProductionWeb()).toBe(false);
    });
  });

  it('enables the cloud-backed runtime only with the explicit build value', () => {
    process.env.EXPO_PUBLIC_ICAO_WEB_RUNTIME = 'edgeone-production';
    jest.isolateModules(() => {
      const runtime = require('../web-runtime') as typeof import('../web-runtime');
      expect(runtime.WEB_RUNTIME).toBe('edgeone-production');
      expect(runtime.isEdgeOneProductionWeb()).toBe(true);
    });
  });
});
