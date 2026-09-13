import { randomUUID } from 'expo-crypto';
import { apiAccessToken, getApiBaseUrl } from './api-client';
export type ProductClick = 'bank_open' | 'feature_open' | 'audio_play' | 'record' | 'highlight' | 'tag' | 'dictionary' | 'transcription' | 'analysis' | 'membership_open' | 'purchase';
let studyContext = 'study';
export function setClickStudyContext(context: string) { studyContext = context; }
/** Best-effort counts only. No text, recording or answer is collected; never blocks learning. */
export function trackProductClick(event: ProductClick, context = studyContext) {
  const body = JSON.stringify([{ id: randomUUID(), event, context: context.replace(/[^a-zA-Z0-9_/-]/g, '').slice(0, 100) }]);
  void (async () => {
    const token = await apiAccessToken();
    const base = getApiBaseUrl();
    if (!token || !base) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try { await fetch(`${base}/v1/product-clicks`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  })().catch(() => {});
}
