import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const siteRoot = path.join(root, 'official-site');
const company = '云启航科（成都）科技有限公司';
const appName = '听你五个';
const publicBase = 'https://yunqihangke.com/apps/readyoufife';
const aiLabel = 'AI 辅助生成';
const aiExportLabel = 'AI辅助生成';
const modelDisclosure = 'DeepSeek-V4-Flash-0731（Deepseek Chat，备案号 Beijing-DeepseekChat-202404280016）';

const pages = [
  {
    route: '/apps/readyoufife/privacy/',
    fragments: [
      company,
      appName,
      'privacy@yunqihangke.com',
      '腾讯云语音识别',
      '腾讯云计算（北京）有限责任公司',
      '异常残留最长保留 24 小时',
      '反馈工单、可选联系方式、图片和主动提交的诊断最长 365 天',
      'DeepSeek 开放平台',
      modelDisclosure,
      aiLabel,
      'Apple App Store 以非自动续期方式销售',
      '/apps/readyoufife/privacy-choices/',
      '/apps/readyoufife/account-deletion/',
    ],
  },
  {
    route: '/apps/readyoufife/terms/',
    fragments: [
      company,
      appName,
      '不代表国际民用航空组织（ICAO）',
      modelDisclosure,
      aiLabel,
      '不得恶意删除、遮挡或隐匿标识',
      '/apps/readyoufife/privacy/',
      '/apps/readyoufife/account-deletion/',
    ],
  },
  {
    route: '/apps/readyoufife/account-deletion/',
    fragments: [
      company,
      appName,
      '“我的”—“设置”—“账号安全”—“注销账号”',
      'privacy@yunqihangke.com',
      '请不要在首次邮件中发送身份证件、密码、短信验证码',
      '数据库备份最多 7 天',
    ],
  },
  {
    route: '/apps/readyoufife/support/',
    fragments: [
      company,
      appName,
      'support@yunqihangke.com',
      '请不要发送密码、短信验证码',
      '/apps/readyoufife/privacy/',
      '/apps/readyoufife/account-deletion/',
    ],
  },
  {
    route: '/apps/readyoufife/privacy-choices/',
    fragments: [
      company,
      appName,
      '导出账号和学习数据',
      '更正或删除部分数据',
      '撤回 AI 同意',
      aiExportLabel,
      'DeepSeek-V4-Flash-0731',
      'Beijing-DeepseekChat-202404280016',
      '永久注销账号',
      'privacy@yunqihangke.com',
      '/apps/readyoufife/account-deletion/',
    ],
  },
];

for (const page of pages) {
  const file = routeToFile(page.route);
  const html = await readFile(file, 'utf8');
  const canonical = `${publicBase}${page.route.slice('/apps/readyoufife'.length)}`;
  requireFragment(html, `rel="canonical" href="${canonical}"`, file);
  for (const fragment of page.fragments) requireFragment(html, fragment, file);
  verifyBalancedLandmarks(html, file);
  await verifyInternalLinks(html, file);
}

const sitemapPath = path.join(siteRoot, 'sitemap.xml');
const sitemap = await readFile(sitemapPath, 'utf8');
for (const page of pages) requireFragment(sitemap, `${publicBase}${page.route.slice('/apps/readyoufife'.length)}`, sitemapPath);

const app = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
if (app.expo.name !== appName || app.expo.ios.bundleIdentifier !== 'com.readyoufife.ios' || app.expo.android.package !== 'com.readyoufife.app') {
  throw new Error('App name or native identifiers no longer match the public legal pages.');
}

const infoPath = path.join(root, 'src/features/info/InfoScreen.tsx');
const info = await readFile(infoPath, 'utf8');
for (const fragment of [company, appName, '版本 v4.2', '手机号', 'resolveLegalRuntimeCopy(Platform.OS)', 'AI 生成内容标识', '单次最多 30 条', '本机最多保留 50 条', '诊断不包含录音、回答、文件地址（URI）、Token 或账号信息', '导出账号和学习数据、撤回 AI 同意、删除全部 AI 结果或清除学习数据', '在“学习记录”删除单条 AI 结果', '清除学习数据仍保留账号、会员和订单', 'privacy@yunqihangke.com']) {
  requireFragment(info, fragment, infoPath);
}
const formalAgreementScope = '听你五个 iOS、Android 正式 App 及其相关服务';
requireFragment(info, formalAgreementScope, infoPath);
requireFragment(await readFile(routeToFile('/apps/readyoufife/terms/'), 'utf8'), formalAgreementScope, routeToFile('/apps/readyoufife/terms/'));
if (info.includes('iOS、Android、Web 产品')) {
  throw new Error('Formal in-app agreement must not include Web in the iOS/Android App scope.');
}
const privacyChoicesPath = routeToFile('/apps/readyoufife/privacy-choices/');
const privacyChoices = await readFile(privacyChoicesPath, 'utf8');
for (const fragment of ['设置—账号与隐私', '导出账号和学习数据', '删除全部 AI 结果', '清除学习数据']) {
  requireFragment(privacyChoices, fragment, privacyChoicesPath);
}
if (privacyChoices.includes('1.0.0 暂不提供 App 内自助导出入口')) {
  throw new Error('Public privacy choices must match the in-App self-service export capability.');
}

const legalReleasePath = path.join(root, 'src/features/info/legal-release-surface.ts');
const legalRelease = await readFile(legalReleasePath, 'utf8');
const formalMarker = 'export const FORMAL_APP_LEGAL_COPY';
const legacyMarker = 'export const VERCEL_LEGACY_LEGAL_COPY';
const formalStart = legalRelease.indexOf(formalMarker);
const legacyStart = legalRelease.indexOf(legacyMarker);
if (formalStart < 0 || legacyStart <= formalStart) {
  throw new Error('Formal and Vercel legacy legal copy boundaries are missing.');
}
const formalLegalRelease = legalRelease.slice(formalStart, legacyStart);
for (const fragment of ['16周岁', '微信登录', '微信 OpenSDK', '不包含微信支付能力', '腾讯云 EdgeOne', '腾讯云语音识别', 'DeepSeek 开放平台', '杭州深度求索人工智能基础技术研究有限公司', 'DEEPSEEK_MODEL_FILING_DISCLOSURE', 'AI_GENERATED_CONTENT_LABEL', '不得恶意删除、遮挡或隐匿该标识', '本地静态词典查词不调用文本 AI、不消耗 AI 点数']) {
  requireFragment(formalLegalRelease, fragment, legalReleasePath);
}
for (const retiredProvider of ['阿里云百炼', '通义千问', 'qwen']) {
  if (formalLegalRelease.toLowerCase().includes(retiredProvider.toLowerCase())) {
    throw new Error(`Formal Native/EdgeOne legal copy still references retired provider: ${retiredProvider}`);
  }
}
for (const fragment of ['isVercelLegacyWeb(platform, runtime)', 'VERCEL_LEGACY_LEGAL_COPY', 'FORMAL_APP_LEGAL_COPY']) {
  requireFragment(legalRelease, fragment, legalReleasePath);
}

const contractsPath = path.join(root, 'packages/contracts/src/index.ts');
const contracts = await readFile(contractsPath, 'utf8');
for (const fragment of [aiLabel, aiExportLabel, 'DeepSeek-V4-Flash-0731', 'Deepseek Chat', 'Beijing-DeepseekChat-202404280016']) {
  requireFragment(contracts, fragment, contractsPath);
}

const storePath = path.join(root, 'docs/resources/operations/native-store-submission-materials.md');
const store = await readFile(storePath, 'utf8');
for (const page of pages) requireFragment(store, `${publicBase}${page.route.slice('/apps/readyoufife'.length)}`, storePath);

console.log(`native legal pages verified: ${pages.length} pages`);

function routeToFile(route) {
  return path.join(siteRoot, route.replace(/^\//u, ''), 'index.html');
}

function requireFragment(content, fragment, file) {
  if (!content.includes(fragment)) throw new Error(`${path.relative(root, file)} is missing required content: ${fragment}`);
}

function verifyBalancedLandmarks(html, file) {
  for (const tag of ['html', 'head', 'body', 'main', 'section', 'footer']) {
    const opening = html.match(new RegExp(`<${tag}\\b`, 'giu'))?.length ?? 0;
    const closing = html.match(new RegExp(`</${tag}>`, 'giu'))?.length ?? 0;
    if (opening !== closing) throw new Error(`${path.relative(root, file)} has unbalanced <${tag}> elements (${opening}/${closing}).`);
  }
}

async function verifyInternalLinks(html, file) {
  const links = [...html.matchAll(/href="(\/[^"]*)"/gu)].map((match) => match[1]);
  for (const rawLink of links) {
    const clean = rawLink.split(/[?#]/u, 1)[0];
    if (!clean || clean === '/') {
      await access(path.join(siteRoot, 'index.html'));
      continue;
    }
    const target = clean.endsWith('/')
      ? path.join(siteRoot, clean, 'index.html')
      : path.join(siteRoot, clean);
    try {
      await access(target);
    } catch {
      throw new Error(`${path.relative(root, file)} links to a missing site asset: ${rawLink}`);
    }
  }
}
