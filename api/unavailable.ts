import { failure, requestId } from './_lib/http';

export default {
  fetch() {
    return failure(requestId(), 501, 'web_demo_feature_unavailable');
  },
};
