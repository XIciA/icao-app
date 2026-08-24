import { isVercelLegacyWeb, type WebRuntime, WEB_RUNTIME } from '@/config/web-runtime';

export type LegalRuntimeCopy = Readonly<{
  agreementAccountDescription: string;
  agreementCommerceDescription?: string;
  agreementContentDescription: string;
  privacyAccountDescription: string;
  textAiDescription: string;
  thirdPartyDescription: string;
  aiRecordsDescription: string;
  minorDescription: string;
}>;

export const FORMAL_APP_LEGAL_COPY: LegalRuntimeCopy = Object.freeze({
  agreementAccountDescription: '本应用仅向已满16周岁的用户提供注册和服务。您可以使用中国大陆手机号验证码、手机号密码或 Apple 登录，并应妥善保管验证码、密码和登录状态。手机号已属于其他账号时，不会自动合并账号或转移数据和权益。1.0.0 不提供微信登录。',
  agreementCommerceDescription: 'iOS 提供7、15、31、62和93天五档会员，均通过 Apple App Store 以非自动续期方式购买。价格以购买页显示的 App Store 实际本地化价格为准；到期不自动扣款，重复购买会从当前最终到期时间继续顺延。退款按 Apple 规则处理，注销账号会放弃该账号剩余权益。',
  agreementContentDescription: '本 App 相关题库、音频、文章、界面、软件和其他内容由云启航科（成都）科技有限公司或相关权利人依法享有权利。除法律允许或另有书面授权外，仅限个人学习使用，不得批量复制、抓取、传播、出售、反向工程或用于训练其他模型。',
  privacyAccountDescription: '我们处理手机号、Apple 提供的账号标识及您授权提供的姓名或邮箱、昵称、登录时间、会话和安全记录，用于登录、账号保护、设备会话管理和防止滥用。认证会话保存在 App 设备安全存储中；我们不读取通讯录、定位或广告标识。',
  textAiDescription: '回答文本只在您主动请求分析时发送至 DeepSeek 开放平台，用于语法纠错和表达润色。',
  thirdPartyDescription: '我们使用阿里云基础设施、短信服务商、腾讯云 EdgeOne、腾讯云语音识别、杭州深度求索人工智能基础技术研究有限公司提供的 DeepSeek 开放平台，以及 Apple/Android 操作系统和分发平台提供必要的登录、托管、加速、AI、内购、系统权限和分发能力。',
  aiRecordsDescription: 'AI 用量日志记录账号、请求编号、功能、状态、模型、提示版本、耗时和用量，不记录录音或完整回答内容。本地静态词典查词不调用文本 AI、不消耗 AI 点数，也不生成 AI 查询缓存。账号和学习数据在账号存续及提供同步服务所需期间保存；达到目的、保存期届满、您撤回同意或注销账号后，我们会依法删除或停止处理。',
  minorDescription: '本应用面向16周岁及以上的航空英语学习者，不向16周岁以下用户提供服务。我们采用访问控制、加密传输、受限存储、备份和日志审计保护数据；如发生可能影响您权益的安全事件，将依法采取补救并告知。政策发生重要变化时会显著提示，并在依法需要时重新取得同意。',
});

export const VERCEL_LEGACY_LEGAL_COPY: LegalRuntimeCopy = Object.freeze({
  agreementAccountDescription: '本产品通过手机号短信验证码或运营阶段提供的授权方式建立账号。您应妥善保管验证码和登录状态，不得转售、出租或以其他方式允许未经授权的第三方使用。发现异常登录时，请及时退出全部设备并联系支持。',
  agreementContentDescription: '题库、音频、课程、文章、界面、软件及相关成果受知识产权法律保护。除法律允许或另有书面授权外，仅限个人学习使用，不得批量复制、抓取、传播、出售、反向工程或用于训练其他模型。',
  privacyAccountDescription: '我们处理手机号、账号标识、昵称、登录时间、会话和安全记录，用于短信验证码登录、账号保护、设备会话管理和防止滥用。认证会话保存在 App 设备安全存储或浏览器站点存储中；我们不读取通讯录或定位信息。',
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
