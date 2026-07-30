import { requestId, success } from './_lib/http';

export default {
  fetch() {
    return success(requestId(), {
      ready: true,
      runtime: 'vercel',
      contentRelease: process.env.EXPO_PUBLIC_ICAO_WEB_CONTENT_RELEASE ?? 'not-configured',
    });
  },
};
