import { expect, it } from 'vitest';
import { estimateCostMicrounits as cost } from './usage-cost';
it('estimates successful calls from measured tokens/time and leaves missing/failed data unknown',()=>{
  expect(cost({model:'16k_en',status:'success',audioDurationSeconds:3600})).toBe(1750000);
  expect(cost({model:'16k_zh_en_2.0',status:'success',audioDurationSeconds:3600})).toBe(800000);
  expect(cost({model:'deepseek-v4-flash',status:'success',inputTokens:1000,outputTokens:100,at:new Date('2026-09-14T01:00:00Z')})).toBe(2800);
  expect(cost({model:'deepseek-v4-flash',status:'success',inputTokens:1000,outputTokens:100,at:new Date('2026-09-13T01:00:00Z')})).toBe(1400);
  expect(cost({model:'16k_en',status:'success'})).toBeNull();
  expect(cost({model:'16k_en',status:'failed',audioDurationSeconds:10})).toBeNull();
});
