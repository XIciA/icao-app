import { loadConfig } from './config';

const config = loadConfig();

console.log(JSON.stringify({
  releaseId: config.apiReleaseId,
  status: 'ok',
  providers: ['deepseek', 'tencent-asr'],
}));
