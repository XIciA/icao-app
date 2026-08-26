import { readFile } from 'node:fs/promises';

const root = new URL('../../../../', import.meta.url);
const [source, appJsonSource, nativeProducts, serverProducts, profileSource, accountSource] = await Promise.all([
  readFile(new URL('./app-store-connect-final-fields.md', import.meta.url), 'utf8'),
  readFile(new URL('app.json', root), 'utf8'),
  readFile(new URL('src/features/native-commercial-testflight/membership-products.native.ts', root), 'utf8'),
  readFile(new URL('services/api/src/commerce/product-catalog.ts', root), 'utf8'),
  readFile(new URL('src/features/profile/ProfileHomeScreen.tsx', root), 'utf8'),
  readFile(new URL('src/features/account/AccountScreen.tsx', root), 'utf8'),
]);
const encoder = new TextEncoder();

function fail(message) {
  throw new Error(`app_store_fields:${message}`);
}

function field(name) {
  const marker = `<!-- field:${name} -->`;
  const start = source.indexOf(marker);
  if (start < 0) fail(`missing_field:${name}`);
  const rest = source.slice(start + marker.length);
  const match = rest.match(/^\s*```text\n([\s\S]*?)\n```/u);
  if (!match) fail(`invalid_field_block:${name}`);
  return match[1];
}

function codePoints(value) {
  return Array.from(value).length;
}

function assertAtMost(name, value, maximum) {
  const actual = codePoints(value);
  if (actual > maximum) fail(`${name}_characters:${actual}>${maximum}`);
}

function assertBytesAtMost(name, value, maximum) {
  const actual = encoder.encode(value).byteLength;
  if (actual > maximum) fail(`${name}_bytes:${actual}>${maximum}`);
}

const appName = field('app-name');
const subtitle = field('subtitle');
const promotionalText = field('promotional-text');
const description = field('description');
const keywords = field('keywords');
const reviewNotes = field('review-notes');
const appJson = JSON.parse(appJsonSource);

if (appJson.expo.name !== appName || appJson.expo.version !== '1.0.0' || appJson.expo.ios?.bundleIdentifier !== 'com.readyoufife.ios') {
  fail('native_app_identity_drift');
}

if (codePoints(appName) < 2) fail('app_name_too_short');
assertAtMost('app_name', appName, 30);
assertAtMost('subtitle', subtitle, 30);
assertAtMost('promotional_text', promotionalText, 170);
assertAtMost('description', description, 4_000);
assertBytesAtMost('keywords', keywords, 100);
assertAtMost('review_notes', reviewNotes, 4_000);
assertBytesAtMost('review_notes', reviewNotes, 4_000);

for (const keyword of keywords.split(',')) {
  if (keyword !== keyword.trim() || codePoints(keyword) <= 2) fail(`invalid_keyword:${keyword}`);
}
if (new Set(keywords.split(',')).size !== keywords.split(',').length) fail('duplicate_keyword');

for (const forbidden of ['体系课程', '学习报告', '包过', '通过率', '真实考题', '内部题库', '全部原创', '微信', '通义千问']) {
  if (`${promotionalText}\n${description}\n${keywords}`.includes(forbidden)) {
    fail(`public_metadata_forbidden:${forbidden}`);
  }
}

if (/微信|WeChat/u.test(`${promotionalText}\n${description}\n${keywords}\n${reviewNotes}`)) {
  fail('wechat_reference_in_public_fields');
}

for (const staleContract of [
  '| App 可用地区 | Specific Countries or Regions：仅中国大陆',
  '| 中国大陆组织合规 | D-U-N-S、公司中文名和 USCI 均已核实',
]) {
  if (source.includes(staleContract)) fail(`stale_platform_contract:${staleContract}`);
}

for (const required of [
  'Automatically release this version',
  'Override to Higher Age Rating',
  '腾讯云语音识别',
  'Tencent Cloud ASR',
  'DeepSeek',
  'https://api.readyoufife.com/v1/commerce/apple/notifications/v2',
  '| Production Notifications Version | Version 2 |',
  '| Sandbox Notifications Version | Version 2 |',
  'All Countries or Regions（当前全部可用 App Store 国家或地区）',
  '| Apple ID | `6800583111` |',
  '取消选择 `Make this app available`',
  '取消选择 `Make this app available on Apple Vision Pro`',
  '<ASC_ONLY_ICP_FILING_NUMBER>',
  '<ASC_ONLY_CHINA_MAINLAND_COMPLIANCE_VERIFIED>',
  '| Audio Data | Yes | No | App Functionality |',
  '| Purchase History | Yes | No | App Functionality |',
  'https://yunqihangke.com/apps/readyoufife/support/',
  'https://yunqihangke.com/apps/readyoufife/privacy/',
  'https://yunqihangke.com/apps/readyoufife/privacy-choices/',
]) {
  if (!source.includes(required)) fail(`missing_required_contract:${required}`);
}

for (const requiredGate of [
  '门禁尚未全部通过，不可直接提交',
  '生产备份、隔离恢复、数据库迁移和 API 发布已从干净',
  '稳定 Device ID 不再发送或保存',
  'D7 冻结的账号/学习数据导出、清除学习数据及删除 AI 结果等用户入口已进入主线',
  'Paid Apps Agreement、银行和税务有效',
  'Apple Production 与 Sandbox 测试通知',
  'Support URL 提供准确、最新且易用的联系方式',
  '无需为了增加字段而编造或在该页面重复公开地址、电话',
  '本 App 面向欧盟分发且公司属于交易商时',
  '负责人须在 App Store Connect 使用正式资料完成 DSA 保存和电话/邮箱验证',
  '仓库候选地址或未验证号码均不能替代 DSA 资料',
]) {
  if (!source.includes(requiredGate)) fail(`missing_contact_gate:${requiredGate}`);
}

for (const reviewPath of [
  '“我的”→“设置”→“账号安全”→“注销账号”',
  'Me > Settings > Account Security > Delete Account',
]) {
  if (!reviewNotes.includes(reviewPath)) fail(`missing_review_path:${reviewPath}`);
}

for (const sourcePath of [
  [profileSource, "{ slug: 'settings', label: '设置'"],
  [profileSource, "router.push('/account/settings')"],
  [accountSource, 'label="账号安全" onPress={() => router.push(\'/account/security\')}'],
  [accountSource, 'label="注销账号" hint="永久删除账号与活跃数据"'],
]) {
  if (!sourcePath[0].includes(sourcePath[1])) fail(`native_review_path_drift:${sourcePath[1]}`);
}

for (const token of ['<ASC_ONLY_ACCOUNT_B_PHONE>', '<ASC_ONLY_ACCOUNT_B_PASSWORD>']) {
  if (!reviewNotes.includes(token)) fail(`missing_platform_token:${token}`);
}

const allowedPlatformTokens = new Set([
  '<ASC_ONLY_ICP_FILING_NUMBER>',
  '<ASC_ONLY_CHINA_MAINLAND_COMPLIANCE_VERIFIED>',
  '<ASC_ONLY_REVIEW_CONTACT_FIRST_NAME>',
  '<ASC_ONLY_REVIEW_CONTACT_LAST_NAME>',
  '<ASC_ONLY_REVIEW_CONTACT_PHONE>',
  '<ASC_ONLY_REVIEW_CONTACT_EMAIL>',
  '<ASC_ONLY_ACCOUNT_A_PHONE>',
  '<ASC_ONLY_ACCOUNT_A_PASSWORD>',
  '<ASC_ONLY_ACCOUNT_B_PHONE>',
  '<ASC_ONLY_ACCOUNT_B_PASSWORD>',
]);
const observedPlatformTokens = new Set(source.match(/<ASC_ONLY_[A-Z0-9_]+>/gu) ?? []);
for (const token of allowedPlatformTokens) {
  if (!observedPlatformTokens.has(token)) fail(`missing_platform_token:${token}`);
}
for (const token of observedPlatformTokens) {
  if (!allowedPlatformTokens.has(token)) fail(`unexpected_platform_token:${token}`);
}

const productStart = source.indexOf('<!-- iap-products:start -->');
const productEnd = source.indexOf('<!-- iap-products:end -->');
if (productStart < 0 || productEnd <= productStart) fail('missing_iap_table');
const productRows = source.slice(productStart, productEnd).split('\n').filter((line) => /^\| (7|15|31|62|93) \|/u.test(line));
if (productRows.length !== 5) fail(`iap_row_count:${productRows.length}`);

const expectedProducts = new Map([
  [7, ['Membership 7 Days v1', 'com.readyoufife.ios.membership.7d.v1', '7天会员', '解锁会员内容7天', '¥68', 'membership_7d_v1']],
  [15, ['Membership 15 Days v1', 'com.readyoufife.ios.membership.15d.v1', '15天会员', '解锁会员内容15天', '¥108', 'membership_15d_v1']],
  [31, ['Membership 31 Days v1', 'com.readyoufife.ios.membership.31d.v1', '31天会员', '解锁会员内容31天', '¥168', 'membership_31d_v1']],
  [62, ['Membership 62 Days v1', 'com.readyoufife.ios.membership.62d.v1', '62天会员', '解锁会员内容62天', '¥298', 'membership_62d_v1']],
  [93, ['Membership 93 Days v1', 'com.readyoufife.ios.membership.93d.v1', '93天会员', '解锁会员内容93天', '¥398', 'membership_93d_v1']],
]);

for (const row of productRows) {
  const cells = row.split('|').slice(1, -1).map((value) => value.trim().replace(/^`|`$/gu, ''));
  const [daysText, referenceName, productId, displayName, productDescription, targetPrice, entitlementKey] = cells;
  const days = Number(daysText);
  const expected = expectedProducts.get(days);
  if (!expected || [referenceName, productId, displayName, productDescription, targetPrice, entitlementKey].some((value, index) => value !== expected[index])) {
    fail(`iap_contract:${daysText}`);
  }
  for (const productSource of [nativeProducts, serverProducts]) {
    if (!productSource.includes(`'${productId}'`) || !productSource.includes(`'${entitlementKey}'`)) {
      fail(`iap_source_drift:${daysText}`);
    }
  }
  assertAtMost(`iap_reference_${days}`, referenceName, 64);
  if (!/^[A-Za-z0-9._-]{1,100}$/u.test(productId)) fail(`iap_product_id:${days}`);
  if (codePoints(displayName) < 2) fail(`iap_display_name_too_short:${days}`);
  assertAtMost(`iap_display_name_${days}`, displayName, 30);
  assertAtMost(`iap_description_${days}`, productDescription, 45);
  assertAtMost(`iap_review_notes_${days}`, field(`iap-review-notes-${days}`), 4_000);
}

if (/【待|首轮草案|非自动续期商品材料/u.test(source)) fail('legacy_draft_marker');

process.stdout.write([
  'App Store final field structure verified; submission remains blocked by the complete release gates.',
  `name=${codePoints(appName)}/30 chars`,
  `subtitle=${codePoints(subtitle)}/30 chars`,
  `promotionalText=${codePoints(promotionalText)}/170 chars`,
  `description=${codePoints(description)}/4000 chars`,
  `keywords=${encoder.encode(keywords).byteLength}/100 bytes`,
  `reviewNotes=${codePoints(reviewNotes)}/4000 chars, ${encoder.encode(reviewNotes).byteLength}/4000 bytes`,
  'iapProducts=5',
].join('\n') + '\n');
