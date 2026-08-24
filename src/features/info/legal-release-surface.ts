import { isVercelLegacyWeb, type WebRuntime, WEB_RUNTIME } from '@/config/web-runtime';

export type LegalRuntimeCopy = Readonly<{
  textAiDescription: string;
  thirdPartyDescription: string;
  aiRecordsDescription: string;
  minorDescription: string;
}>;

export const FORMAL_APP_LEGAL_COPY: LegalRuntimeCopy = Object.freeze({
  textAiDescription: '回答文本只在您主动请求分析时发送至 DeepSeek 开放平台，用于语法纠错和表达润色。',
  thirdPartyDescription: '我们使用阿里云基础设施、腾讯云 EdgeOne、腾讯云语音识别、杭州深度求索人工智能基础技术研究有限公司提供的 DeepSeek 开放平台，以及 Apple/Android 操作系统和分发平台提供必要的托管、加速、AI、系统权限和分发能力。',
  aiRecordsDescription: 'AI 用量日志记录账号、请求编号、功能、状态、模型、提示版本、耗时和用量，不记录录音或完整回答内容。本地静态词典查词不调用文本 AI、不消耗 AI 点数，也不生成 AI 查询缓存。账号和学习数据在账号存续及提供同步服务所需期间保存；达到目的、保存期届满、您撤回同意或注销账号后，我们会依法删除或停止处理。',
  minorDescription: '本应用面向16周岁及以上的航空英语学习者，不向16周岁以下用户提供服务。我们采用访问控制、加密传输、受限存储、备份和日志审计保护数据；如发生可能影响您权益的安全事件，将依法采取补救并告知。政策发生重要变化时会显著提示，并在依法需要时重新取得同意。',
});

export const VERCEL_LEGACY_LEGAL_COPY: LegalRuntimeCopy = Object.freeze({
  textAiDescription: '回答文本只在您主动请求分析时发送至阿里云百炼通义千问。',
  thirdPartyDescription: '我们使用阿里云基础设施、腾讯云 EdgeOne、腾讯云语音识别、阿里云百炼及 Apple/Android 操作系统和分发平台提供必要的托管、加速、AI、系统权限和分发能力。',
  aiRecordsDescription: 'AI 用量日志记录账号、请求编号、功能、状态、模型、提示版本、耗时和用量，不记录录音或完整回答内容。AI 单词查询缓存默认保留 30 天。账号和学习数据在账号存续及提供同步服务所需期间保存；达到目的、保存期届满、您撤回同意或注销账号后，我们会依法删除或停止处理。',
  minorDescription: '本应用主要面向成年航空英语学习者。不满十四周岁的用户应在监护人同意和指导下使用。我们采用访问控制、加密传输、受限存储、备份和日志审计保护数据；如发生可能影响您权益的安全事件，将依法采取补救并告知。政策发生重要变化时会显著提示，并在依法需要时重新取得同意。',
});

export function resolveLegalRuntimeCopy(
  platform: string,
  runtime: WebRuntime = WEB_RUNTIME,
): LegalRuntimeCopy {
  return isVercelLegacyWeb(platform, runtime)
    ? VERCEL_LEGACY_LEGAL_COPY
    : FORMAL_APP_LEGAL_COPY;
}
