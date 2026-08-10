import {
  DEFAULT_TENCENT_ASR_MODEL,
  isTencentAsrModel,
  type TencentAsrModel,
} from '@icao/contracts';

import Storage from '@/platform/storage';

const STORAGE_KEY = 'icao.ai.tencent-asr-model.v1';

export const ASR_MODEL_OPTIONS: readonly {
  model: TencentAsrModel;
  title: string;
  description: string;
}[] = [
  { model: '16k_zh_en_2.0', title: '中英大模型 2.0', description: '适合中英混合、口音或背景噪声场景' },
  { model: '16k_en_large', title: '英语大模型', description: '优先识别英语，适合航空英语练习' },
  { model: '16k_en', title: '通用英语模型', description: '标准英语通用引擎' },
];

export async function getAsrModel(): Promise<TencentAsrModel> {
  try {
    const stored = await Storage.getItem(STORAGE_KEY);
    return isTencentAsrModel(stored) ? stored : DEFAULT_TENCENT_ASR_MODEL;
  } catch {
    return DEFAULT_TENCENT_ASR_MODEL;
  }
}

export async function setAsrModel(model: TencentAsrModel): Promise<void> {
  await Storage.setItem(STORAGE_KEY, model);
}
