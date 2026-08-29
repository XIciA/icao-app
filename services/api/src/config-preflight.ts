import { DEEPSEEK_MODEL_FILING_DISCLOSURE } from '@icao/contracts';

import { loadConfig } from './config';

const config = loadConfig();

console.log(JSON.stringify({
  releaseId: config.apiReleaseId,
  status: 'ok',
  providers: ['deepseek', 'tencent-asr', 'apple-app-store-server'],
  textAi: {
    grammarModel: config.aiGrammarModel,
    polishModel: config.aiPolishModel,
    publicDisclosure: DEEPSEEK_MODEL_FILING_DISCLOSURE,
  },
}));
