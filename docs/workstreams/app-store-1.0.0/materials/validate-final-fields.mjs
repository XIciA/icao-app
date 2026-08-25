import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./app-store-connect-final-fields.md', import.meta.url), 'utf8');
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

for (const required of [
  'Automatically release this version',
  'Override to Higher Age Rating',
  '腾讯云语音识别',
  'Tencent Cloud ASR',
  'DeepSeek',
  'https://api.readyoufife.com/v1/commerce/apple/notifications/v2',
  '| Production Notifications Version | Version 2 |',
  '| Sandbox Notifications Version | Version 2 |',
  'Specific Countries or Regions：仅中国大陆',
  '取消选择 `Make this app available`',
  '取消选择 `Make this app available on Apple Vision Pro`',
  '<ASC_ONLY_ICP_FILING_NUMBER>',
  'D-U-N-S、公司中文名和 USCI 均已核实',
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
  '生产备份、隔离恢复与全部待执行迁移演练',
  '稳定 Device ID 不再发送或保存',
  '完成 D7 冻结的账号/学习数据导出、清除学习数据',
  'Paid Apps Agreement、银行和税务有效',
  'Apple Production 与 Sandbox 测试通知',
  '当前已知注册地址只是仓库候选，不是已验证事实',
  '不得为了通过门禁编造号码',
  '将核实后的注册地址与公开支持电话发布到 Support URL，并验证页面在目标网络可访问、电话可接通',
  'App Store Connect 受保护审核联系人电话不能替代 Support URL 的公开支持电话',
]) {
  if (!source.includes(requiredGate)) fail(`missing_support_url_gate:${requiredGate}`);
}

for (const token of ['<ASC_ONLY_ACCOUNT_B_PHONE>', '<ASC_ONLY_ACCOUNT_B_PASSWORD>']) {
  if (!reviewNotes.includes(token)) fail(`missing_platform_token:${token}`);
}

const allowedPlatformTokens = new Set([
  '<ASC_ONLY_ICP_FILING_NUMBER>',
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
