import { readFile } from 'node:fs/promises';

// Archived decisions below only validate the preserved App Store 1.0.0 material set.
// They are not project-wide rules or authorization for subsequent releases.
const root = new URL('../../../../', import.meta.url);
const [source, appJsonSource, nativeProducts, serverProducts, profileSource, accountSource, ...releaseSources] = await Promise.all([
  readFile(new URL('./app-store-connect-final-fields.md', import.meta.url), 'utf8'),
  readFile(new URL('app.json', root), 'utf8'),
  readFile(new URL('src/features/native-commercial-testflight/membership-products.native.ts', root), 'utf8'),
  readFile(new URL('services/api/src/commerce/product-catalog.ts', root), 'utf8'),
  readFile(new URL('src/features/profile/ProfileHomeScreen.tsx', root), 'utf8'),
  readFile(new URL('src/features/account/AccountScreen.tsx', root), 'utf8'),
  readFile(new URL('docs/records/decisions/native-commercialization/d9-release-channels.md', root), 'utf8'),
  readFile(new URL('docs/workstreams/app-store-1.0.0-final-release/requirements.md', root), 'utf8'),
  readFile(new URL('docs/workstreams/app-store-1.0.0-final-release/roadmap.md', root), 'utf8'),
  readFile(new URL('docs/workstreams/app-store-1.0.0-final-release/technical-plan.md', root), 'utf8'),
  readFile(new URL('docs/workstreams/app-store-1.0.0-final-release/technical-audit.md', root), 'utf8'),
  readFile(new URL('docs/workstreams/app-store-1.0.0-final-release/phase-log.md', root), 'utf8'),
  readFile(new URL('./README.md', import.meta.url), 'utf8'),
  readFile(new URL('./screenshots.md', import.meta.url), 'utf8'),
  readFile(new URL('./evidence-and-owner-actions.md', import.meta.url), 'utf8'),
]);
const [d2Source, d4Source, d7Source, d8Source] = await Promise.all([
  readFile(new URL('docs/records/decisions/native-commercialization/d2-login-methods.md', root), 'utf8'),
  readFile(new URL('docs/records/decisions/native-commercialization/d4-membership-and-pricing.md', root), 'utf8'),
  readFile(new URL('docs/records/decisions/native-commercialization/d7-data-privacy-and-retention.md', root), 'utf8'),
  readFile(new URL('docs/records/decisions/native-commercialization/d8-operations-console-structure.md', root), 'utf8'),
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

function assertOrdered(name, value, markers) {
  let previous = -1;
  for (const marker of markers) {
    const current = value.indexOf(marker);
    if (current <= previous) fail(`${name}:${marker}`);
    previous = current;
  }
}

const appName = field('app-name');
const subtitle = field('subtitle');
const promotionalText = field('promotional-text');
const description = field('description');
const keywords = field('keywords');
const reviewNotes = field('review-notes');
const appJson = JSON.parse(appJsonSource);
const materialsBuild = '3493766';
const currentBuild = String(appJson.expo.ios?.buildNumber ?? '');

if (
  appJson.expo.name !== appName
  || !/^\d+\.\d+\.\d+$/u.test(appJson.expo.version ?? '')
  || appJson.expo.ios?.bundleIdentifier !== 'com.readyoufife.ios'
  || !/^[1-9]\d*$/u.test(currentBuild)
  || !Number.isSafeInteger(Number(currentBuild))
  || appJson.expo.android?.versionCode !== Number(currentBuild)
) {
  fail('native_app_identity_drift');
}

// Repository CI can validate preserved materials while a newer TestFlight is in
// development. Public submission must still bind to the materials' exact build.
if (currentBuild !== materialsBuild || appJson.expo.version !== '1.0.0') {
  if (process.argv.includes('--submission')) fail('submission_materials_require_current_build_review');
  console.log(`Historical App Store materials target build ${materialsBuild}; build ${currentBuild} requires separate material review before public submission.`);
}

const releaseSourceContracts = [
  ['d9', releaseSources[0], ['当前最高已上传 Build 为 `3493765`', '下一送审候选预留为', 'Build `3493766`', '最终候选由 Build `3493766` 覆盖']],
  ['requirements', releaseSources[1], ['内部 Build 必须在已上传 Build 基础上单调递增', '旧 Build 和旧截图不得作为最终证据']],
  ['roadmap', releaseSources[2], ['从 App Store Connect 读取最高 Build，更新为严格递增值，经 PR 合入 `main`', '从干净 `origin/main` 归档并上传 TestFlight']],
  ['technical-plan', releaseSources[3], ['当前最高已上传 Build 为 `3493765`', '本轮正式产物候选固定递增为 `3493766`']],
  ['technical-audit', releaseSources[4], ['当前最高已上传 Build 为 `3493765`', '下一候选必须严格递增为 Build `3493766`', '不得用于最终截图或 App Store 提交']],
  ['phase-log', releaseSources[5], ['当前最高已上传并关联版本页的 Build 为 `3493765`', '已把修复候选递增为 `3493766`']],
  ['materials-readme', releaseSources[6], ['`3493761`、', '`3493764` 与 `3493765` 仅作历史候选保留', '最终候选递增为 Build `3493766`']],
  ['screenshots', releaseSources[7], ['Build `3493766` 的唯一截图清单', '`3493761`、`3493764` 与 `3493765` 仅作历史候选保留']],
  ['evidence', releaseSources[8], ['| Build | `3493766` |', 'Build 3493766 处理完成后替换版本页构建', 'Paid Apps Agreement 有效']],
];
for (const [name, releaseSource, contracts] of releaseSourceContracts) {
  for (const contract of contracts) {
    if (!releaseSource.includes(contract)) fail(`release_candidate_drift:${name}:${contract}`);
  }
}

const submissionScopeContracts = [
  ['d2', d2Source, ['只准备一个由公司长期控制的中国大陆手机号', '审核顺序固定为同一账号先完成', '最后执行账号注销']],
  ['d4', d4Source, ['销售地区都只选择中国大陆', '不定义其他国家或地区的可用性和销售价', '不作为 App Store 提交、审核或发布门禁']],
  ['d7', d7Source, ['可视化后台首次投产时的角色仅为管理员和客服', '延后到 App Store 1.0.0 上架后', '审核或发布门禁']],
  ['d8', d8Source, ['可视化后台首次投产时', '1.0.0 上架后，不是 TestFlight', '提交、审核或发布门禁']],
  ['d9', releaseSources[0], ['五档 IAP 都只选择中国大陆', 'DSA 交易商验证不适用于本次提交', '审核流程固定为同一账号先完成完整体验', '提交、审核或发布门禁']],
  ['materials-readme', releaseSources[6], ['App 与五档 IAP 只在中国大陆销售', 'DSA 不适用', '完整体验→购买→恢复→最后注销', '不是提交、审核或发布门禁']],
  ['final-fields', source, ['Specific Countries or Regions：仅中国大陆', 'DSA 交易商验证不适用', '完整体验→购买→恢复→最后注销', '不是提交、审核或发布门禁']],
  ['evidence', releaseSources[8], ['App与五档IAP都只供应中国大陆', '本次不适用；以后扩区前重新审查', '完整体验→购买→恢复→最后注销', '不是1.0.0提交、审核或发布门禁']],
];
for (const [name, scopeSource, contracts] of submissionScopeContracts) {
  for (const contract of contracts) {
    if (!scopeSource.includes(contract)) fail(`submission_scope_drift:${name}:${contract}`);
  }
}

const submissionScopeSources = submissionScopeContracts.map(([name, scopeSource]) => [name, scopeSource]);
for (const staleContract of [
  'All Countries or Regions',
  '全部可用 App Store 国家或地区',
  '175个',
  '175 个',
  '全球供应',
  '账号 A 用于',
  '账号 B 用于',
  'Account A',
  'Account B',
  '两个审核账号',
  '两个 App Store 审核账号',
  '两个 Production 审核账号',
  '<ASC_ONLY_ACCOUNT_A_PHONE>',
  '<ASC_ONLY_ACCOUNT_A_PASSWORD>',
  '<ASC_ONLY_ACCOUNT_B_PHONE>',
  '<ASC_ONLY_ACCOUNT_B_PASSWORD>',
  'DSA 联系信息门禁',
  '完成 App Store DSA 交易商合规',
  '完成 DSA 保存和电话/邮箱验证',
  '重新选择交易商',
  '仍须部署 Ops',
  'Ops 仍待部署',
  '首发基础可视化运营后台方案已最终批准',
  '可视化 Ops 后台是 Native App 1.0.0 的正式运营门槛',
]) {
  for (const [name, scopeSource] of submissionScopeSources) {
    if (scopeSource.includes(staleContract)) fail(`stale_submission_scope:${name}:${staleContract}`);
  }
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

if (/微信|WeChat/u.test(`${promotionalText}\n${description}\n${keywords}`)) {
  fail('wechat_reference_in_public_fields');
}

for (const staleContract of [
  'All Countries or Regions（当前全部可用 App Store 国家或地区）',
  '账号 A',
  '账号 B',
  '<ASC_ONLY_ACCOUNT_A_PHONE>',
  '<ASC_ONLY_ACCOUNT_A_PASSWORD>',
  '<ASC_ONLY_ACCOUNT_B_PHONE>',
  '<ASC_ONLY_ACCOUNT_B_PASSWORD>',
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
  'DeepSeek-V4-Flash-0731（Deepseek Chat，备案号 Beijing-DeepseekChat-202404280016）',
  'AI 辅助生成',
  'contentLabel“AI辅助生成”',
  'https://api.readyoufife.com/v1/commerce/apple/notifications/v2',
  '| Production Notifications Version | Version 2 |',
  '| Sandbox Notifications Version | Version 2 |',
  'Specific Countries or Regions：仅中国大陆',
  '关闭自动在新增地区供应',
  '| Apple ID | `6800583111` |',
  '取消选择 `Make this app available`',
  '取消选择 `Make this app available on Apple Vision Pro`',
  '蜀ICP备2026045996号-1A',
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
  '本次只在中国大陆销售，欧盟不在范围，DSA 交易商验证不适用',
  '可视化 Ops 延后到上架后',
  '一个 Production 审核账号',
]) {
  if (!source.includes(requiredGate)) fail(`missing_contact_gate:${requiredGate}`);
}

for (const reviewPath of [
  '“我的”→“设置”→“账号安全”→“注销账号”',
  'Me > Settings > Account Security > Delete Account',
]) {
  if (!reviewNotes.includes(reviewPath)) fail(`missing_review_path:${reviewPath}`);
}

assertOrdered('review_notes_chinese_flow', reviewNotes, [
  '【登录】',
  '【题库与会员】',
  '【录音与 AI】',
  '【五档内购】',
  '请先用当前账号完成沙盒购买',
  '购买成功后点击同页“恢复购买”',
  '【注销】',
  '最后进入“我的”→“设置”→“账号安全”→“注销账号”',
]);
assertOrdered('review_notes_english_flow', reviewNotes, [
  '[Sign-in]',
  '[Recording and AI]',
  '[Membership and IAP]',
  'First use the current account for a sandbox purchase',
  'after it succeeds, tap Restore Purchases',
  '[Account deletion]',
  'Delete Account last',
]);

for (const aiDisclosure of [
  'DeepSeek-V4-Flash-0731（Deepseek Chat，备案号 Beijing-DeepseekChat-202404280016）',
  '即时结果区及“学习记录”持续显示“AI 辅助生成”',
  'contentLabel“AI辅助生成”、模型和备案信息',
  'DeepSeek-V4-Flash-0731 (Deepseek Chat, filing No. Beijing-DeepseekChat-202404280016)',
]) {
  if (!reviewNotes.includes(aiDisclosure)) fail(`missing_ai_review_disclosure:${aiDisclosure}`);
}

for (const sourcePath of [
  [profileSource, "{ slug: 'settings', label: '设置'"],
  [profileSource, "router.push('/account/settings')"],
  [accountSource, 'label="账号安全" onPress={() => router.push(\'/account/security\')}'],
  [accountSource, 'label="注销账号" hint="永久删除账号与活跃数据"'],
]) {
  if (!sourcePath[0].includes(sourcePath[1])) fail(`native_review_path_drift:${sourcePath[1]}`);
}

const allowedPlatformTokens = new Set([
  '<ASC_ONLY_CHINA_MAINLAND_COMPLIANCE_VERIFIED>',
  '<ASC_ONLY_REVIEW_CONTACT_FIRST_NAME>',
  '<ASC_ONLY_REVIEW_CONTACT_LAST_NAME>',
  '<ASC_ONLY_REVIEW_CONTACT_PHONE>',
  '<ASC_ONLY_REVIEW_CONTACT_EMAIL>',
  '<ASC_ONLY_REVIEW_ACCOUNT_PHONE>',
  '<ASC_ONLY_REVIEW_ACCOUNT_PASSWORD>',
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
  'App Store final fields verified: China-only, DSA not applicable, single review account with deletion last, and Ops post-launch.',
  'Submission remains blocked only by the remaining release gates listed in the material.',
  `name=${codePoints(appName)}/30 chars`,
  `subtitle=${codePoints(subtitle)}/30 chars`,
  `promotionalText=${codePoints(promotionalText)}/170 chars`,
  `description=${codePoints(description)}/4000 chars`,
  `keywords=${encoder.encode(keywords).byteLength}/100 bytes`,
  `reviewNotes=${codePoints(reviewNotes)}/4000 chars, ${encoder.encode(reviewNotes).byteLength}/4000 bytes`,
  'iapProducts=5',
].join('\n') + '\n');
