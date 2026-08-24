import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const siteRoot = path.join(root, 'official-site');
const company = '云启航科（成都）科技有限公司';
const appName = '听你五个';
const publicBase = 'https://yunqihangke.com/apps/readyoufife';

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
      '反馈图片默认保留 365 天',
      '/apps/readyoufife/account-deletion/',
    ],
  },
  {
    route: '/apps/readyoufife/terms/',
    fragments: [
      company,
      appName,
      '不代表国际民用航空组织（ICAO）',
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
      '请不要在首次邮件中发送身份证件、完整邀请码',
      '数据库备份默认最多保留 7 天',
    ],
  },
  {
    route: '/apps/readyoufife/support/',
    fragments: [
      company,
      appName,
      'support@yunqihangke.com',
      '请不要发送密码、完整邀请码',
      '/apps/readyoufife/privacy/',
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
for (const fragment of [company, appName, '版本 v4.0', '手机号', 'resolveLegalRuntimeCopy(Platform.OS)', '单次最多 30 条', '本机最多保留 50 条', '诊断不包含录音、回答、文件地址（URI）、Token 或账号信息', 'privacy@yunqihangke.com']) {
  requireFragment(info, fragment, infoPath);
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
for (const fragment of ['16周岁', '腾讯云 EdgeOne', '腾讯云语音识别', 'DeepSeek 开放平台', '杭州深度求索人工智能基础技术研究有限公司', '本地静态词典查词不调用文本 AI、不消耗 AI 点数']) {
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
