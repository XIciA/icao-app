#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const scriptRepositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = process.env.ICAO_WEB_FREEZE_TEST_ROOT
  ? path.resolve(process.env.ICAO_WEB_FREEZE_TEST_ROOT)
  : scriptRepositoryRoot;
const defaultManifestPath = path.join(
  repositoryRoot,
  'docs/records/workstreams/native-commercial-launch/evidence/web-freeze-manifest.json',
);
const approvedManifestSha256 = '9c833024567b133031d4825bd867cdf3aaa67e0574343cb7e81b13c74a5f8804';
const approvedNativeBuildBase = 'bc44f5f26ea45b8ecb89669452aaf480b62f2957';
// User-approved 900-sentence content-only replacement, 2026-09-10.
// Exact hashes permit the two artifacts and their resource partitioner only; every other Web input remains frozen.
const approved900ContentHashes = new Map([['src/features/question-bank/data/question-bank.json', 'd38adbeb28176454d3c124e83b02d182c4645034264a5f9b73d8679334e78ecf'], ['src/features/question-bank/data/question-bank-release.json', '65f6f88d90baa31fb1495a3b9f6bda20feb799e04380a30cb2b57afadd684912']]);
// The user-requested global removal of listening-main-829 also applies to the
// legacy Vercel snapshot. Pin the resulting bytes; no other legacy edit passes.
const reviewedLegacyQuestionRemovalHash = '2bfacfa95474ab42e17204d28889d3af400c93dae80d833b384185b9089630ce';
approved900ContentHashes.set('tools/web-content-sync.mjs', 'c068b0c4744708a9cb76c324757d3c854f17d435d430b8fa6ab4d0be444987ef');
const approvedNativeIncrementBase = 'b27a2b81514390b037cba5fd96f72180998d0205';
const approvedNativeIncrementHashes = new Map([
  ['app.config.js', 'a17b33af850819c55e67534656a4e6f0efb858b6d6841caf82ce8dc8db6589b2'],
  ['package.json', 'cee4cb5ab75e040dd58134578fb1001197f46747acb815219022848810a37c5e'],
  ['packages/contracts/src/index.ts', '8f5607cd2cda4757a61894797a6f36b8d3f40248ae57206268d3c95562e2add4'],
  ['pnpm-lock.yaml', '96bfa611b82a49b435aed6f477a788cb2efb0b78c776507ef78c155d9750fab9'],
  ['src/app/_layout.tsx', '6e1e6c63667d5bff4816d0d195e71383fbca7d406d5a63120bdc32c2053dc732'],
]);
const approvedNativeIncrementPaths = new Set([
  ...approvedNativeIncrementHashes.keys(),
  'app.json',
]);

// Explicitly reviewed TestFlight route repair. Expo's Web require.context
// includes this file, but its platform router never selects it on Web. Keep
// both route implementations pinned; this is not a Native-suffix exemption.
const reviewedStudyNativePath = 'src/app/question-bank/[bankId]/study/[categoryId]/[topicId].native.tsx';
const reviewedStudyWebPath = 'src/app/question-bank/[bankId]/study/[categoryId]/[topicId].tsx';
const reviewedStudyNativeHash = '191397e34824130111034b6aa0ae768841eee8db08f51e8b1742430107110ade';
const reviewedStudyNativeBaseHash = 'f0df1d0b8ba31c22302c3ceffe4a6244e64a34341a6e85d1175f4dfd1fce6e4d';
const reviewedStudyWebHash = '2c58b1d7bb5477cc782e3984b56c46c57b1c65b707dbac13ac70fcd8593bfe39';

// Reviewed Native/EdgeOne-only dependencies (installed version and clipboard).
// Clipboard is imported only by ContactRow.native; legacy runtime imports stay unchanged.
// Lockfile review preserves every existing version and adds only expo-clipboard 55.0.14.
// Existing dependency versions and the Web resolver graph remain unchanged.
const reviewedAppIdentityDependencyHashes = new Map([
  ['package.json', ['cee4cb5ab75e040dd58134578fb1001197f46747acb815219022848810a37c5e', '162f0078797d725160b936dfbb0db9a20e1e4914a598b392095269f3f7d74784']],
  ['pnpm-lock.yaml', ['96bfa611b82a49b435aed6f477a788cb2efb0b78c776507ef78c155d9750fab9', '32b104dc495aa019188b30a67fb5797875ae58bd2a382c7a4914b9dacd1e2d02']],
]);

// Reviewed 2026-09-18: EdgeOne-only bridges and the user-authorized APK button.
// Exact before/after hashes only; no general exemption for browser or native files.
const reviewedFormalWebHashes = new Map([
  // User-authorized Vercel lookup pronunciation, 2026-09-20; existing voice reused.
  ['src/features/vocabulary/speech.ts', ['9d8d0b98e76e96d875a6259047c4d057270ba5381f00c13889a016f32551b481', '491ec412d742283ad8b9b7055c73edbb76056ba8dee36cdc1558fe428a99b5f6']],
  ['src/features/question-bank/components/LegacyLookupPronunciation.tsx', [null, 'e035b5b2a51cacd3a91a844e0354c098f8361cb4da125c0778ce550bf54433f1']],
  // Native short word taps select the row; legacy Web uses its unchanged tap-lookup branch.
  ["src/features/question-bank/components/ChoiceList.tsx", ["a01ee82589be4232472395555408a25f8b76a963cf1e16b1fdb2d581395a8d70", "d2716333d1cd8ca29ac6ce5417fe63363db272722e29f47cffbb8b2e50752ac4"]],
  // Reviewed candidate metadata only; legacy display version remains 1.0.0.
  // iOS 1.0.1 rebuild pins the exact app.json bytes from the 3542838 source,
  // with only marketing/build identifiers changed.
  ["app.json", ["255bfdaf744cc57b0d402c255ce67e7a157587e5a6eb579010c3b397b18d53c3", "fe8481feccadf35008d6254c8a7e20afe73ad0fff1e7aef68f7dae8922943a36", "79f7b75cf315f15c985108411cd7c16814b4b986d23db5275077bc4d3e28fbcc"]],
  // 2026-09-20: redirect only the legacy repository's two imports to immutable,
  // byte-identical v13 snapshots so an APK link release cannot ship new banks.
  ["src/features/question-bank/data/repository.ts", ["0ac548558e76bfdbc726acb76f41e6ab0289d5b61e521221b75dc8b15a7f93db", "62cd533bc380b9e8c68f908ba2f7034eb5fb30c139a0f9e8dce62f623d6c13c6"]],
  // 2026-09-20: exact reviewed scope dependencies of the Native study route.
  // Scope helpers are inlined without semantic changes so plain Node 22 can
  // load the existing source-export package; the legacy route stays unchanged.
  // Expo Web includes that route in context, but the router proof below keeps
  // it unselected on Vercel. Radio empty-state and answer-card changes retain
  // explicit legacy guards. No content dataset or legacy route is exempted.
  ["packages/contracts/src/index.ts", ["8f5607cd2cda4757a61894797a6f36b8d3f40248ae57206268d3c95562e2add4", "721bfa9a9a83f03ca23db0fef9193b3ce9ebb9ffb59b13c66eb312a83601a5ad"]],
  ["src/features/account/profile-model.ts", [null, "dddb1948c1ba2b7c961d62e9acb55808b735869a62bcd57e1dddb0ef003ade5a"]],
  ["src/features/account/profile-store.native.ts", [null, "16a8cc5e31a9a6b1774b126cbebc02a32727ea11714416efde4c8a3929592ca2"]],
  ["src/features/question-bank/annotations/annotation-store.native.ts", [null, "079c3a7ee22748387e2d81fac885943c3b38ee79bb499363ca680d89c488d339"]],
  ["src/features/question-bank/lib/study-materials.native.ts", [null, "543765cae861673168b578ff9061a68b8e4650a96ec4e660833d3ecd82c74287"]],
  ["src/features/question-bank/lib/study-review.native.ts", [null, "568f99b3dde8d314c5469a03c70a4885886d70d160c5c2de7d9f0011a3fc9771"]],
  ["src/features/question-bank/lib/study-scope.ts", [null, "bf379ef1b7f9f1873c08986722a3e4aaccf4bc1c7da2a43bc9088a4061edbfd5"]],
  ["src/features/question-bank/platform/learning-record-storage.native.ts", [null, "9422dbffcdf68c680b837f3ce8bb735158b2cde45efb08e778df7ef4e62b45cd"]],
  ["src/features/sync/learning-sync.native.ts", [null, "76d3c4137eb5403fc2b55f7c0be0664df2b9726bfaea65fb3f6f32ec434b79a9"]],
  ["src/features/content/RadioPlayerScreen.tsx", ["94e12998e82066cee0632f566951329a25bee32a4fee8465504afca37bbaf27a", "da7d2cb6d7f54428fef93d6620325a1187691f4a25371fec8023132c969f049d"]],
  ["src/features/question-bank/hooks/useQuestionBankTopic.native.ts", ["20a67d213b57d8de523a8ae33d3ccc6dd825eb56d11e0036288aaf3325b2a52f", "ca38cc12af380e4216f485e8535a18da3afb15bb5c97bd39ad8c5155ac5c7198"]],
  ["src/platform/audio/audio-session-orchestrator.ts", ["d7ee1cedd46e9b9a4964ab1b25195ff0568ede69f387b8ce487e46cb1874b516", "def21c332d36f00daeeb7e9b4a272f296b36cc6882342cede8a1d121b98d37de"]],
  // 2026-09-19: user-authorized Vercel answer-card results and upper-left tag dots.
  // Runtime guards retain Native/EdgeOne output; only these exact UI inputs are approved.
  ["src/features/question-bank/components/AnswerCardSheet.tsx", ["50e00cde4882980ad00e3c32313ecfd78631fa707e5d6d06cedf12c23fe36eba", "ed30659f02b672c85bfe3163b65ec1500e19a41219ef49265873c8218508c55f"]],
  ["src/features/question-bank/components/QuestionBankStudyScreen.tsx", ["b0d2abef18998f5312cc00a24b8f1fbbefe954746b56006ce34025e91268ee31", "bae835bdc38f4480e158c8c37cce4543ab2dc4463e277afe0985fe183e9796d1"]],
  // 2026-09-19: user-authorized public APK download on both websites.
  // Root layout changes only the /download exemption; all learning routes keep their auth guard.
  // 2026-09-19 Android parity: exact reviewed Android branches.
  // Web shadow/hold behavior is unchanged; native recorder failures use a platform-neutral label.
  ["src/theme/tokens.ts", ["a12723112d79fb8ce78395ebea79ae2057f8cedfde0788b7cfa5b55a9e0e22fb", "840cdd8c958219e2e228c98301d23677d8119dedf22db01523854bfe419b10b8"]],
  ["src/features/question-bank/recording/recording-engine.ts", ["de59e2b3c90f2f88b551ed02848f67a14c02ab16bd89733295cc592fb5d5403a", "c9c43d207ed469f238ff1325b18d59847fb2e55fec497fa80010a63117159665"]],
  // 2026-09-18: download link moves into existing headers; renders null on Vercel/Native.
  ['src/app/(tabs)/index.tsx', ['1db0d65bd730db78b7a8d9593f268031e093f4c02c85049b79a363adcdeda3ca', '3f2dbc096f2d1f20a793982ddc0125f18e3de49b37bad01c730870082608d1c2']],
  // 2026-10-13: restore the EdgeOne header shortcut; Vercel/Native still render null.
  ['src/components/platform/WebAppDownloadLink.tsx', [null, '1f19c9bc5d31315d0fde3b4a6aab6170237ccaa2e2b078644238edd54c71dc08']],
  ['patches/react-native-reanimated@4.2.1.patch', [null, '2110d0c65efd75dc19fcda10411a628c61202965736eba134ff69e42609f26bd']],
  ['.vercelignore', ['a3d50ec9c80c6644c5f67c9461ccd4b7ccd3378af4cad618e1f7931232156bdb', '916c0e0fe0a01d56b657ecd2d460fb5b17f3f882b56cf00e7d055989ef846909']],
  // Android CMake path patch; package versions and all JavaScript stay identical.
  ['pnpm-workspace.yaml', ['6921135eec6d4d34d7508b385c4a2d9f0d7c8665382f963534c2162267b3dfca', 'becf75d14c36abeb44a3101d052af47cd2ce7a2242927b0f6a6f81c6c24d100a']],
  ['patches/expo-modules-core@55.0.25.patch', [null, '7c4af49fe3dabe894cd566135b04b5bf8d951b6a26a880fe0fcec806c75df6e7']],
  [
    "metro.config.js",
    [
      "f198870ad147b9572961c05327bc3616077328d9696aa5debb6103d8aeb7a71e",
      "797adeaf4cf6c604716a2b768d35b9e6231df6e63265591a2133dc33c3e8313a"
    ]
  ],
  [
    "src/app/_layout.tsx",
    [
      "6e1e6c63667d5bff4816d0d195e71383fbca7d406d5a63120bdc32c2053dc732",
      "6f79dc9a17b33ac050b5bc9477948c1aeae0facfa1c6bfb81f11fcbcdc9b3c53"
    ]
  ],
  [
    "src/app/download.tsx",
    [
      null,
      "9ae7b8662978ecb8c8fa4b560124bab1caa01e1801f6b82e9449110776cb7b1b"
    ]
  ],
  [
    "src/components/platform/EdgeOneAlertHost.tsx",
    [
      null,
      "f450380d17bebdcb3a18fd6f7732ab5f946ddaa5d40936950d36477af34f1d1b"
    ]
  ],
  [
    "src/features/auth/phone-otp-storage.web.ts",
    [
      null,
      "0b95f6b10a64548ccce8eb54eb7e14fb609141958b08c875a9a4b25b2e882fdf"
    ]
  ],
  [
    "src/features/auth/secure-session-storage.web.ts",
    [
      null,
      "dacdd5efeb93c8d11515ab4118f748e68b0795486143e94487ac1d27e870b395"
    ]
  ],
  [
    "src/features/content/AppDownloadScreen.tsx",
    [
      "87b29194e178462bdc81f85c264fa3e12be9027846c6c1264441eeabf9fa6947",
      "0f3775f3e39513598f9bd60df9c29898ad92f47c1cf493fb0fc3892abe9e4d71"
    ]
  ],
  [
    "tools/edgeone-shared-modules.cjs",
    [
      null,
      "308e93f6f3f1d722b8b3004579472f54dcb8b37d9147dd5ac8aa5c3a2b28f075"
    ]
  ]
]);

// 2026-09-23 AI/annotation task: type-only legacy contracts/palettes transpile
// identically to HEAD; managed colors and mutations resolve only on Native/EdgeOne.
// The existing Native route proof still excludes that route on Vercel. No legacy
// page, AI endpoint, content or deployment exemption is granted here.
reviewedFormalWebHashes.set("packages/contracts/src/index.ts", ["8f5607cd2cda4757a61894797a6f36b8d3f40248ae57206268d3c95562e2add4", "ac855563ad946df567f5e56a12aa35e444c967ce04fb77670800fdac8858bd0d"]);
reviewedFormalWebHashes.set("src/features/question-bank/annotations/colors.ts", ["3dbcb635004af0665a7762333860671b1a0da726b3fc85a3bafd6f215648191a", "9e51a2debdc9a200210b53f88a551c8497e1a75e06eb07887cbe14f5ac1e2509"]);
reviewedFormalWebHashes.set("src/features/question-bank/annotations/types.ts", ["d648ef01a088c278ea35b0a940f0246dbf1b7bbf03c70078dd5c4b335d7b0712", "c784141a43b71601278f2dca8fec1baad7a23a0d0d46b8c6574aeccbea254ef1"]);
reviewedFormalWebHashes.set("src/features/question-bank/annotations/annotation-store.native.ts", [null, "5e1dd5afe4bdc78c5fd9817743e063172492bdabb660b74e11a95f6048c5dc11"]);
reviewedFormalWebHashes.set("src/features/sync/learning-sync.native.ts", [null, "f92ad61b8dd5ca4bac2c20be3f2b2fe829913f340f2a220de0959a85369b17c5"]);
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [null, "7b51f0da8dfa8efbc6132cd95c32f07d5efe0a3a2bbaca58b17e9868fefeb41d"]);
reviewedFormalWebHashes.set("packages/contracts/src/annotation-management.ts", [null, "725cf8d2432ae96898d4e6c6f847fef960ba8375b3a9b9f882433741fe2ed49a"]);
// These three Native-only changes were already pinned above. Permit their
// exact reviewed bytes to coexist with the one-card legacy content removal.
reviewedFormalWebHashes.set('package.json', reviewedAppIdentityDependencyHashes.get('package.json'));
reviewedFormalWebHashes.set('pnpm-lock.yaml', reviewedAppIdentityDependencyHashes.get('pnpm-lock.yaml'));
reviewedFormalWebHashes.set(reviewedStudyNativePath, [reviewedStudyNativeBaseHash, reviewedStudyNativeHash]);

// 2026-09-26: only two unused-in-legacy icon exports; existing exports unchanged.
reviewedFormalWebHashes.set('src/components/ui/icons.ts', ['f4901f9193f07c3a9299371f5aa1173389ec1dc5c531645dca1152c780f504d0', '90039b5045f3ce1bb0d679c1b3f8ad631fdf22759d0b4466f08f2c01bef1ea03']);

// EdgeOne download lookup reuses the published update parser. The legacy branch
// retains its existing environment URL and performs no manifest request.
reviewedFormalWebHashes.set('src/features/app-updates/update-model.ts', [null, '5360f31166b3d4b2bdddcf64069b7f95fafb715b3bfa510ceedca741277b331e']);

// 2026-10-17: exact Native bug-repair inputs included by Expo route discovery.
// Web route siblings remain unchanged and router selection is regression-tested.
// This does not allow arbitrary future Native edits or rebaseline the old website.
reviewedFormalWebHashes.set("src/app/_layout.native.tsx", [null, "d2b9ab2e37b46b5811dafc740346efd16b39870f8eed212349fd12336f6b7fca"]);
reviewedFormalWebHashes.set("src/app/question-bank/[bankId]/index.native.tsx", [null, "26df3200b583169c3a96011c79a37cd5e69850cada4b797885302eef19162e20"]);
reviewedFormalWebHashes.set("src/features/question-bank/annotations/card-index.native.ts", [null, "31f47e7c1f97615ade309221772369b19961dcb0a99ad0e18a8b80cc14e8924a"]);
reviewedFormalWebHashes.set("src/features/question-bank/components/QuestionBankCatalog.native.tsx", [null, "11837f54c72def83ddd7b8272c85a29c33f50a2fbfa22170e229102cb23bffaf"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/card-directory.ts", [null, "834b60ea7eb0a5cbbd192d303d07e35a1ca737287e5eaabf4cd67236dbff6550"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/content-version.native.ts", [null, "c3e4c8a714fc6f70958b026fbed9cc29b78d8d95bdde7e490a3b8742a4aabd22"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/member-content-cache.ts", [null, "689236f90d0ae0695f93e1f9af7903e1e79e9ac16d815260663d47ecaa46493a"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/question-bank-public-release.json", [null, "ca4c044413a4763a012e4a0ddc81743e0df75a6e128a76ece823194216acb7a7"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/question-bank-public.json", [null, "f35f3c8591bcb3148158b6dd602a8aa1b3e10ae4acc2d59cccf0785a32aa58e5"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/repository.native.ts", [null, "7902d631024ec6fbb0debc21cf01d96639bc5b892cf0c75bf520b1e113ec55e1"]);
reviewedFormalWebHashes.set("src/features/question-bank/hooks/useQuestionBank.native.ts", [null, "26aa755295e1f9cd404aa9ef9a8e1536a0695f69eaa6e9ff4f6c5fe3ea3cae53"]);
reviewedFormalWebHashes.set("src/features/question-bank/hooks/useStudyCatalog.native.ts", [null, "a9db57b4110e4910f4de91c9ba03308f7f053434bf83261de54b4bab2d7872f8"]);
reviewedFormalWebHashes.set("src/features/sync/learning-sync.native.ts", [null, "31213b4ede0e658c8b5f244f22aabf0b057a477586eff2a07546a1a5d1067cdc"]);
reviewedFormalWebHashes.set("src/features/question-bank/hooks/useQuestionBankTopic.native.ts", ["20a67d213b57d8de523a8ae33d3ccc6dd825eb56d11e0036288aaf3325b2a52f", "cc1b5308275595e7728bbdf0c7b6c74f4842cdd0bff10d652e71dd10db0ee069"]);
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [null, "c23cf53f60ccb97c77b7677a94174ab143805e14f098ee788fe11bfc8b18c4c4"]);

// 2026-10-17 Native/EdgeOne feature update: exact reviewed inputs only.
// Legacy route siblings, legacy snapshots, version.web.ts and Vercel configuration remain unchanged.
// PDF/font/catalog dependencies belong to the unselected native catalog route; the
// installed router selection is tested. Download changes run behind the existing
// EdgeOne guard. New PDF dependencies preserve all previously locked versions.
reviewedFormalWebHashes.set("assets/fonts/NotoSerifSC_600SemiBold.ttf", [null, "73bb1df903dc81dc528153b40c5602e516005482723255f6767e72281e317821"]);
reviewedFormalWebHashes.set("src/app/question-bank/[bankId]/index.native.tsx", [null, "554e028b7b24f0edef94206bb9c0512d6c97d9d29b0a7893d114af7a8600731b"]);
reviewedFormalWebHashes.set("src/features/app-updates/update-model.ts", [null, "722815395cf0fb511c4fa3d3c83c27d299e207156d8fa6a7059b31e612109e8d"]);
reviewedFormalWebHashes.set("src/features/question-bank/components/AirlineMark.tsx", [null, "5e37880dac5b0706b13623dcee081da76e6d3f4281afd37e34f6dae66c81f7c8"]);
reviewedFormalWebHashes.set("src/features/question-bank/components/QuestionBankCatalog.native.tsx", [null, "41d33be6a4234d4aeb96f88b299cced4dff0a8b4a71d808193a698ebbc18ac9d"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/question-bank-public-release.json", [null, "5f95032a6ab3c37bf1d9ef36f24397ad6d2bb644ba196aa0cdfcf8a07b1fa2c6"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/question-bank-public.json", [null, "8cb210a06d26fba8bcd8160d2914d532435f768264193789527406f809e450db"]);
reviewedFormalWebHashes.set("src/features/question-bank/export/SentenceExportScreen.tsx", [null, "f813399136f30c1645a71f4222744ffe2aa636326bbc33cb5f3de8c26492ccde"]);
reviewedFormalWebHashes.set("src/features/question-bank/export/export-model.ts", [null, "6bb6d98076ec1098b36c3876d47002f4f14c8d44504ca54bd3133aa257bd82fc"]);
reviewedFormalWebHashes.set("src/features/question-bank/export/pdf-platform.web.ts", [null, "50c7da311aaa05afc0d87b937348162c14324aa123ec27ef8dc36dcfcf8f70a1"]);
reviewedFormalWebHashes.set("src/features/question-bank/export/sentences-pdf.ts", [null, "2fac2e3901064c6db1fd31957c161ddbe5c125a58b50b33643b77048e38cfdb8"]);
reviewedFormalWebHashes.set("src/features/question-bank/lib/study-scope.ts", [null, "8b0e531aec596be883cf3a5355430ad9d5bc02afc4dca19b572f3d3a9bf045a3"]);
reviewedFormalWebHashes.set("src/features/question-bank/platform/learning-store.native.ts", [null, "70e8893800737cb12a8f1428105e47cf2ee57c361a9a6262ebbcc1e968668579"]);
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [null, "739298c6f78b841930503fa468c59bf921ca303cec45e196a3706ddebc36efb4"]);
reviewedFormalWebHashes.set("app.config.js", ["a17b33af850819c55e67534656a4e6f0efb858b6d6841caf82ce8dc8db6589b2", "f88c41ace896bad43495808b75f2dbf522ea1f0675a177958fc317117b7e106a"]);
reviewedFormalWebHashes.set("app.json", ["255bfdaf744cc57b0d402c255ce67e7a157587e5a6eb579010c3b397b18d53c3", "06df5c9d6a6b9f95e3a7264846267c0beebe4c932c349346fe49be5a1087e28d"]);
reviewedFormalWebHashes.set("package.json", ["cee4cb5ab75e040dd58134578fb1001197f46747acb815219022848810a37c5e", "188be10136c308d53b13be0351d92a5a6d7db3ec54e5d0e7937f78e54fb242bd"]);
reviewedFormalWebHashes.set("packages/contracts/src/index.ts", ["8f5607cd2cda4757a61894797a6f36b8d3f40248ae57206268d3c95562e2add4", "19eed3ec1891088e0b21e428162150a9429efd2ac757d822097ba9146b920360"]);
reviewedFormalWebHashes.set("pnpm-lock.yaml", ["96bfa611b82a49b435aed6f477a788cb2efb0b78c776507ef78c155d9750fab9", "78864173822a160e01e84db91ef6df5d61a1608c6830770d1a1cac35c187212b"]);
reviewedFormalWebHashes.set("src/components/ui/icons.ts", ["f4901f9193f07c3a9299371f5aa1173389ec1dc5c531645dca1152c780f504d0", "6b26cc5ac53e12cfdf083c8676e532ea28558cd19e8b8a8b6e321989ab28a805"]);
reviewedFormalWebHashes.set("src/features/content/AppDownloadScreen.tsx", ["87b29194e178462bdc81f85c264fa3e12be9027846c6c1264441eeabf9fa6947", "a91390f8c6c2aee2a56c019f9d1880d34332fb7ccbe2bb988b2ad7e34aeb7d84"]);

export function normalizeReviewedFormalWebInputs(expected, current) {
  const baseline = new Map(expected.map(file => [file.path, file]));
  const currentPaths = new Set(current.map(file => file.path));
  return current.flatMap(file => {
    // Marketing version 1.1.2 applies to the apps/formal Web only. The legacy
    // Web resolver now selects the byte-identical 1.0.0 module; EdgeOne remaps
    // that module through its exact pinned shared-module table.
    if (file.path === 'src/config/app-version.web.ts') {
      const original = baseline.get('src/config/app-version.ts');
      if (original && !currentPaths.has(original.path) && file.sha256 === original.sha256) return [original];
      return [file];
    }
    const legacyPrefix = 'src/features/question-bank/data/legacy-v13/';
    if (file.path.startsWith(legacyPrefix)) {
      const originalPath = `src/features/question-bank/data/${file.path.slice(legacyPrefix.length)}`;
      const original = baseline.get(originalPath);
      if (!currentPaths.has(originalPath) && original
        && (approved900ContentHashes.get(originalPath) === file.sha256
          || (originalPath === 'src/features/question-bank/data/question-bank.json'
            && file.sha256 === reviewedLegacyQuestionRemovalHash))
        && original.sources.join('\0') === file.sources.join('\0')) {
        return [{ ...file, path: originalPath }];
      }
      // A changed snapshot or simultaneous current-bank import remains a hard
      // freeze failure. This is an exact relocation, not a content exemption.
      return [file];
    }
    const pair = reviewedFormalWebHashes.get(file.path);
    const before = baseline.get(file.path);
    if (!pair || (before?.sha256 ?? null) !== pair[0] || !pair.slice(1).includes(file.sha256)) return [file];
    // Existing protection ownership must remain identical. Added exact bridges
    // are not part of the legacy runtime and are pinned above on every check.
    if (before && before.sources.join('\0') !== file.sources.join('\0')) return [file];
    return before ? [before] : [];
  });
}

const exactProtectedPaths = [
  'patches/react-native-reanimated@4.2.1.patch',
  'patches/expo-modules-core@55.0.25.patch',
  'tools/edgeone-shared-modules.cjs',
  '.vercelignore',
  'app.config.js',
  'app.json',
  'assets/images/favicon.png',
  'assets/images/icon.png',
  'index.js',
  'metro.config.js',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'vercel.json',
];

const protectedTrees = ['api', 'public'];
const webImplementationPattern = /\.web\.(?:[cm]?[jt]sx?)$/u;

function expoResolutionContext(context, platform) {
  return platform === 'web' ? { ...context, preferNativePlatform: false } : context;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJson(entry)]),
  );
}

export function assertNativeBuildOnlyAppJsonDelta(baseApp, currentApp) {
  const baseBuildNumber = baseApp?.expo?.ios?.buildNumber;
  const currentBuildNumber = currentApp?.expo?.ios?.buildNumber;
  const baseVersionCode = baseApp?.expo?.android?.versionCode;
  const currentVersionCode = currentApp?.expo?.android?.versionCode;
  if (
    !/^\d+$/u.test(String(baseBuildNumber ?? ''))
    || !/^\d+$/u.test(String(currentBuildNumber ?? ''))
    || !Number.isSafeInteger(baseVersionCode)
    || !Number.isSafeInteger(currentVersionCode)
  ) {
    throw new Error('app.json Native build identifiers must be positive decimal integers');
  }
  const baseBuild = Number(baseBuildNumber);
  const currentBuild = Number(currentBuildNumber);
  if (
    !Number.isSafeInteger(baseBuild)
    || !Number.isSafeInteger(currentBuild)
    || baseBuild <= 0
    || currentBuild <= baseBuild
    || baseVersionCode <= 0
    || currentVersionCode <= baseVersionCode
    || currentBuild !== currentVersionCode
  ) {
    throw new Error('app.json must advance matching iOS and Android build identifiers');
  }

  const stripNativeBuildIdentifiers = (app) => {
    const normalized = structuredClone(app);
    delete normalized.expo.ios.buildNumber;
    delete normalized.expo.android.versionCode;
    return canonicalJson(normalized);
  };
  if (
    JSON.stringify(stripNativeBuildIdentifiers(baseApp))
    !== JSON.stringify(stripNativeBuildIdentifiers(currentApp))
  ) {
    throw new Error('app.json changes more than the reviewed Native build identifiers');
  }
}

function normalizedProtectedContent(repositoryPath, content) {
  if (repositoryPath !== 'vercel.json') return content;
  const config = JSON.parse(content.toString('utf8'));
  delete config.name;
  delete config.version;
  return Buffer.from(JSON.stringify(canonicalJson(config)));
}

function toRepositoryPath(absolutePath) {
  const relativePath = path.relative(repositoryRoot, absolutePath);
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Path is outside the repository: ${absolutePath}`);
  }
  return relativePath.split(path.sep).join('/');
}

function fromRepositoryPath(repositoryPath) {
  if (
    !repositoryPath ||
    path.isAbsolute(repositoryPath) ||
    repositoryPath.split('/').includes('..')
  ) {
    throw new Error(`Invalid repository path in Web freeze manifest: ${repositoryPath}`);
  }
  return path.join(repositoryRoot, ...repositoryPath.split('/'));
}

async function listFilesRecursively(directory) {
  const results = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursively(absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      results.push(absolutePath);
      continue;
    }
    throw new Error(`Unsupported entry in protected Web scope: ${toRepositoryPath(absolutePath)}`);
  }

  return results;
}

async function addExistingFile(selection, repositoryPath, source) {
  const absolutePath = fromRepositoryPath(repositoryPath);
  const stats = await lstat(absolutePath).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!stats) return;
  if (!stats.isFile()) {
    throw new Error(`Protected Web path is not a regular file: ${repositoryPath}`);
  }
  const sources = selection.get(repositoryPath) ?? new Set();
  sources.add(source);
  selection.set(repositoryPath, sources);
}

async function addTree(selection, repositoryPath, source) {
  const absolutePath = fromRepositoryPath(repositoryPath);
  const stats = await lstat(absolutePath).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!stats) return;
  if (!stats.isDirectory()) {
    throw new Error(`Protected Web tree is not a directory: ${repositoryPath}`);
  }
  for (const filePath of await listFilesRecursively(absolutePath)) {
    await addExistingFile(selection, toRepositoryPath(filePath), source);
  }
}

async function resolveWebGraphFiles() {
  const metroConfigPath = path.join(repositoryRoot, 'metro.config.js');
  const metroConfig = require(metroConfigPath);
  const metroPath = require.resolve('metro', {
    paths: [require.resolve('expo/metro-config')],
  });
  const metro = require(metroPath);
  const metroResolver = require(
    require.resolve('metro-resolver', {
      paths: [metroPath],
    }),
  );

  metroConfig.resolver = { ...metroConfig.resolver };
  metroConfig.resolver.useWatchman = false;
  metroConfig.resetCache = false;
  metroConfig.watchFolders = [
    ...new Set([...(metroConfig.watchFolders ?? []), repositoryRoot, scriptRepositoryRoot]),
  ];
  metroConfig.watcher = {
    ...metroConfig.watcher,
    unstable_lazySha1: false,
  };
  metroConfig.resolver.nodeModulesPaths = [
    ...new Set([
      ...(metroConfig.resolver.nodeModulesPaths ?? []),
      path.join(repositoryRoot, 'node_modules'),
      path.join(repositoryRoot, 'node_modules/.pnpm/node_modules'),
      path.join(scriptRepositoryRoot, 'node_modules'),
      path.join(scriptRepositoryRoot, 'node_modules/.pnpm/node_modules'),
    ]),
  ];

  const existingResolveRequest = metroConfig.resolver.resolveRequest;
  metroConfig.resolver.resolveRequest = (context, moduleName, platform) => {
    // Expo CLI disables Metro's `.native.*` fallback while exporting Web. A raw
    // Metro graph leaves `preferNativePlatform` enabled and therefore treats
    // Native-only implementations as Vercel inputs even though `expo export
    // --platform web` does not. Keep this graph aligned with the actual exporter.
    const platformContext = expoResolutionContext(context, platform);
    if (moduleName.startsWith('@/assets/')) {
      return metroResolver.resolve(
        platformContext,
        path.join(repositoryRoot, 'assets', moduleName.slice('@/assets/'.length)),
        platform,
      );
    }
    if (moduleName.startsWith('@/')) {
      return metroResolver.resolve(
        platformContext,
        path.join(repositoryRoot, 'src', moduleName.slice('@/'.length)),
        platform,
      );
    }
    if (existingResolveRequest) {
      return existingResolveRequest(platformContext, moduleName, platform);
    }
    return metroResolver.resolve(platformContext, moduleName, platform);
  };

  const graph = await metro.buildGraph(metroConfig, {
    entries: [path.join(repositoryRoot, 'index.js')],
    platform: 'web',
    dev: false,
    minify: false,
    customTransformOptions: {
      routerRoot: 'src/app',
    },
  });

  const files = [];
  const canonicalRoot = await realpath(repositoryRoot);
  for (const dependencyPath of graph.dependencies.keys()) {
    if (!path.isAbsolute(dependencyPath) || !existsSync(dependencyPath)) continue;
    const canonicalPath = await realpath(dependencyPath);
    const relativePath = path.relative(canonicalRoot, canonicalPath);
    if (
      !relativePath ||
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath) ||
      relativePath.split(path.sep).includes('node_modules')
    ) {
      continue;
    }
    files.push(relativePath.split(path.sep).join('/'));
  }

  return [...new Set(files)].sort();
}

async function collectCurrentSelection() {
  const selection = new Map();

  for (const repositoryPath of exactProtectedPaths) {
    await addExistingFile(selection, repositoryPath, 'exact_web_config_or_asset');
  }
  for (const repositoryPath of protectedTrees) {
    await addTree(selection, repositoryPath, `tree:${repositoryPath}`);
  }

  const srcPath = path.join(repositoryRoot, 'src');
  for (const absolutePath of await listFilesRecursively(srcPath)) {
    const repositoryPath = toRepositoryPath(absolutePath);
    if (webImplementationPattern.test(repositoryPath)) {
      await addExistingFile(selection, repositoryPath, 'platform_web_implementation');
    }
  }

  for (const directoryName of ['scripts', 'tools']) {
    const directoryPath = path.join(repositoryRoot, directoryName);
    for (const absolutePath of await listFilesRecursively(directoryPath)) {
      const repositoryPath = toRepositoryPath(absolutePath);
      const basename = path.basename(repositoryPath).toLowerCase();
      const isWebOwned = basename.includes('web') || basename.includes('promo');
      const isFreezeControl = repositoryPath === 'tools/check-web-freeze.mjs'
        || repositoryPath === 'tools/check-web-freeze-tests.mjs';
      if (!isWebOwned || isFreezeControl) continue;
      await addExistingFile(selection, repositoryPath, 'web_build_or_deploy_tooling');
    }
  }

  for (const repositoryPath of await resolveWebGraphFiles()) {
    // The resolver is authoritative. Do not discard platform-suffixed files
    // after resolution: an explicit import is real Web behavior and must stay
    // protected. Normal Native fallbacks are excluded by the Web context above.
    await addExistingFile(selection, repositoryPath, 'metro_web_dependency_graph');
  }

  return selection;
}

async function fingerprintSelection(selection) {
  const files = [];
  for (const repositoryPath of [...selection.keys()].sort()) {
    const content = await readFile(fromRepositoryPath(repositoryPath));
    files.push({
      path: repositoryPath,
      sha256: sha256(normalizedProtectedContent(repositoryPath, content)),
      sources: [...selection.get(repositoryPath)].sort(),
    });
  }
  const combinedInput = files
    .map((file) => `${file.path}\0${file.sha256}\0${file.sources.join(',')}\n`)
    .join('');
  return {
    files,
    combinedSha256: sha256(Buffer.from(combinedInput)),
  };
}

function combinedSha256(files) {
  const combinedInput = files
    .map((file) => `${file.path}\0${file.sha256}\0${file.sources.join(',')}\n`)
    .join('');
  return sha256(Buffer.from(combinedInput));
}

function fingerprintDifferences(expected, current) {
  const expectedByPath = new Map(expected.map((file) => [file.path, file]));
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  return {
    selectionAdded: current.filter((file) => !expectedByPath.has(file.path)).map((file) => file.path),
    selectionRemoved: expected.filter((file) => !currentByPath.has(file.path)).map((file) => file.path),
    contentChanged: current.filter((file) => expectedByPath.has(file.path)
      && expectedByPath.get(file.path).sha256 !== file.sha256).map((file) => file.path),
    ownershipChanged: current.filter((file) => {
      const expectedFile = expectedByPath.get(file.path);
      return expectedFile && expectedFile.sources.join('\0') !== file.sources.join('\0');
    }).map((file) => file.path),
  };
}

export function assertReviewedNativeStudyRouteDelta(expected, current) {
  const differences = fingerprintDifferences(expected, current);
  const expectedHashes = new Map(expected.map((file) => [file.path, file.sha256]));
  const currentHashes = new Map(current.map((file) => [file.path, file.sha256]));
  differences.contentChanged = differences.contentChanged.filter((file) => {
    const pair = reviewedAppIdentityDependencyHashes.get(file);
    return !pair || expectedHashes.get(file) !== pair[0] || currentHashes.get(file) !== pair[1];
  });
  if (differences.selectionAdded.length || differences.selectionRemoved.length || differences.ownershipChanged.length
    || !differences.contentChanged.includes(reviewedStudyNativePath)
    || differences.contentChanged.some((file) => file !== reviewedStudyNativePath && file !== 'app.json')) {
    throw new Error('unreviewed Web input alongside Native study route repair');
  }
  const before = new Map(expected.map((file) => [file.path, file.sha256]));
  const after = new Map(current.map((file) => [file.path, file.sha256]));
  if (before.get(reviewedStudyNativePath) !== reviewedStudyNativeBaseHash
    || after.get(reviewedStudyNativePath) !== reviewedStudyNativeHash
    || before.get(reviewedStudyWebPath) !== reviewedStudyWebHash
    || after.get(reviewedStudyWebPath) !== reviewedStudyWebHash) {
    throw new Error('Native study route or its Web sibling differs from the exact reviewed content');
  }
  // Exercise the installed, lockfile-protected router rather than assuming
  // that every .native file is unreachable. Explicit Web imports elsewhere
  // remain protected by the unchanged full graph and fingerprints above.
  const { getRoutes } = require('expo-router/build/getRoutesCore');
  const nativeKey = `./${reviewedStudyNativePath.slice('src/app/'.length)}`;
  const webKey = `./${reviewedStudyWebPath.slice('src/app/'.length)}`;
  const context = (key) => {
    if (key === nativeKey) throw new Error('Web selected the Native study implementation');
    return { default: () => null };
  };
  context.keys = () => ['./_layout.tsx', webKey, nativeKey];
  const routes = getRoutes(context, {
    platform: 'web', ignoreEntryPoints: true, skipGenerated: true,
    getSystemRoute: ({ defaults }) => defaults,
  });
  if (routes?.children.length !== 1 || routes.children[0].contextKey !== webKey) {
    throw new Error('Web study route platform selection changed');
  }
  routes.children[0].loadRoute();
  return differences.contentChanged;
}

const nativeBuildReference = "{\n  \"expo\": {\n    \"name\": \"听你五个\",\n    \"slug\": \"readyoufife\",\n    \"version\": \"1.0.0\",\n    \"orientation\": \"portrait\",\n    \"icon\": \"./assets/images/icon.png\",\n    \"scheme\": \"readyoufife\",\n    \"userInterfaceStyle\": \"light\",\n    \"ios\": {\n      \"icon\": \"./assets/images/icon.png\",\n      \"supportsTablet\": false,\n      \"bundleIdentifier\": \"com.readyoufife.ios\",\n      \"buildNumber\": \"3493766\",\n      \"config\": {\n        \"usesNonExemptEncryption\": false\n      },\n      \"infoPlist\": {\n        \"UIBackgroundModes\": [\n          \"audio\"\n        ]\n      }\n    },\n    \"android\": {\n      \"icon\": \"./assets/images/icon.png\",\n      \"predictiveBackGestureEnabled\": false,\n      \"package\": \"com.readyoufife.app\",\n      \"versionCode\": 3493766\n    },\n    \"web\": {\n      \"output\": \"single\",\n      \"favicon\": \"./assets/images/favicon.png\"\n    },\n    \"plugins\": [\n      \"expo-router\",\n      [\n        \"expo-splash-screen\",\n        {\n          \"backgroundColor\": \"#FFFFFF\",\n          \"image\": \"./assets/images/icon.png\",\n          \"imageWidth\": 160,\n          \"resizeMode\": \"contain\",\n          \"android\": {\n            \"imageWidth\": 120\n          }\n        }\n      ],\n      [\n        \"expo-audio\",\n        {\n          \"microphonePermission\": \"允许听你五个使用麦克风录制口语练习；录音仅在你主动点击转写并明确同意后发送至 AI 服务。\",\n          \"enableBackgroundPlayback\": false,\n          \"enableBackgroundRecording\": false\n        }\n      ],\n      \"expo-sqlite\",\n      [\n        \"expo-secure-store\",\n        {\n          \"faceIDPermission\": false\n        }\n      ],\n      \"expo-asset\",\n      [\n        \"expo-image-picker\",\n        {\n          \"photosPermission\": \"允许听你五个选择图片并随反馈提交。\",\n          \"cameraPermission\": false\n        }\n      ],\n      \"./plugins/with-android-release-signing\",\n      \"./plugins/with-ios-release-integrity\"\n    ],\n    \"experiments\": {\n      \"typedRoutes\": true,\n      \"reactCompiler\": true\n    }\n  }\n}\n";

// CLI uploads omit .git. The embedded reference must still match the approved
// manifest byte-for-byte; application identity checks remain identical.
export async function readNativeBuildReference(expectedHash, directory = repositoryRoot) {
  let bytes;
  if (existsSync(path.join(directory, '.git'))) {
    await execFile('git', ['merge-base', '--is-ancestor', approvedNativeBuildBase, 'HEAD'], { cwd: directory });
    const { stdout } = await execFile('git', ['show', `${approvedNativeBuildBase}:app.json`], { cwd: directory, encoding: 'utf8' });
    bytes = Buffer.from(stdout);
  } else {
    bytes = Buffer.from(nativeBuildReference);
  }
  if (sha256(bytes) !== expectedHash) throw new Error('Native build reference does not match the pinned Web manifest');
  return JSON.parse(bytes.toString('utf8'));
}

function evaluateExpoConfig(source, environment) {
  const module = { exports: {} };
  const execute = new Function('module', 'exports', 'process', source);
  execute(module, module.exports, { env: environment });
  const configure = module.exports;
  if (typeof configure !== 'function') throw new Error('app.config.js no longer exports a function');
  const configured = configure({
    config: {
      name: '听你五个',
      scheme: 'readyoufife',
      ios: { bundleIdentifier: 'com.readyoufife.ios' },
      plugins: ['expo-apple-authentication', ['expo-dev-client', { addGeneratedScheme: false }]],
    },
  });
  configured.plugins = configured.plugins.filter((entry) => {
    const name = Array.isArray(entry) ? entry[0] : entry;
    return name !== './plugins/with-wechat-auth';
  });
  return canonicalJson(configured);
}

function webPackageSurface(packageJson) {
  const nativeOnlyDependencies = new Set([
    '@expo/vector-icons',
    '@icao/wechat-auth',
    'expo-modules-core',
  ]);
  return canonicalJson({
    dependencies: Object.fromEntries(Object.entries(packageJson.dependencies ?? {})
      .filter(([name]) => !nativeOnlyDependencies.has(name))),
    devDependencies: packageJson.devDependencies,
    engines: packageJson.engines,
    jest: packageJson.jest,
    main: packageJson.main,
    name: packageJson.name,
    packageManager: packageJson.packageManager,
    private: packageJson.private,
    version: packageJson.version,
    webScripts: Object.fromEntries(Object.entries(packageJson.scripts ?? {})
      .filter(([name]) => name === 'web' || name.startsWith('web:') || name.startsWith('check:web'))),
  });
}

async function assertApprovedNativeIncrement(currentFiles) {
  await execFile(
    'git',
    ['merge-base', '--is-ancestor', approvedNativeIncrementBase, 'HEAD'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  const [{ stdout: changedOutput }, { stdout: untrackedOutput }] = await Promise.all([
    execFile('git', ['diff', '--name-only', '--no-renames', approvedNativeIncrementBase, '--'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }),
    execFile('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }),
  ]);
  const selected = new Set(currentFiles.map(({ path: repositoryPath }) => repositoryPath));
  const changedPaths = [...new Set([
    ...changedOutput.trim().split('\n'),
    ...untrackedOutput.trim().split('\n'),
  ].filter(Boolean))];
  const changedProtectedPaths = changedPaths.filter((repositoryPath) => selected.has(repositoryPath));
  const deletedSharedSource = await Promise.all(changedPaths
    .filter((repositoryPath) => repositoryPath.startsWith('src/')
      && !/\.(?:native|ios|android)\.[cm]?[jt]sx?$/u.test(repositoryPath))
    .map(async (repositoryPath) => {
      if (existsSync(fromRepositoryPath(repositoryPath))) return undefined;
      try {
        await execFile('git', ['cat-file', '-e', `${approvedNativeIncrementBase}:${repositoryPath}`], {
          cwd: repositoryRoot,
        });
        return repositoryPath;
      } catch {
        return undefined;
      }
    }));
  if (deletedSharedSource.some(Boolean)) {
    throw new Error(`deleted shared Web candidate: ${deletedSharedSource.filter(Boolean).join(', ')}`);
  }
  if (
    changedProtectedPaths.length !== approvedNativeIncrementPaths.size
    || changedProtectedPaths.some((repositoryPath) => !approvedNativeIncrementPaths.has(repositoryPath))
  ) {
    throw new Error(`unapproved protected-input delta: ${changedProtectedPaths.join(', ')}`);
  }
  for (const [repositoryPath, expectedHash] of approvedNativeIncrementHashes) {
    const file = currentFiles.find(({ path: candidate }) => candidate === repositoryPath);
    if (!file || file.sha256 !== expectedHash) {
      throw new Error(`approved Native-only input changed without review: ${repositoryPath}`);
    }
  }

  const readBaseFile = async (repositoryPath) => {
    const { stdout } = await execFile('git', ['show', `${approvedNativeIncrementBase}:${repositoryPath}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  };
  const [baseApp, currentApp, baseAppConfig, currentAppConfig, basePackage, currentPackage, baseContracts, currentContracts] = await Promise.all([
    readBaseFile('app.json').then(JSON.parse),
    readFile(fromRepositoryPath('app.json'), 'utf8').then(JSON.parse),
    readBaseFile('app.config.js'),
    readFile(fromRepositoryPath('app.config.js'), 'utf8'),
    readBaseFile('package.json').then(JSON.parse),
    readFile(fromRepositoryPath('package.json'), 'utf8').then(JSON.parse),
    readBaseFile('packages/contracts/src/index.ts'),
    readFile(fromRepositoryPath('packages/contracts/src/index.ts'), 'utf8'),
  ]);
  assertNativeBuildOnlyAppJsonDelta(baseApp, currentApp);
  for (const variant of [undefined, 'development']) {
    const baseConfigured = evaluateExpoConfig(baseAppConfig, { ICAO_APP_VARIANT: variant });
    const currentConfigured = evaluateExpoConfig(currentAppConfig, {
      ICAO_APP_VARIANT: variant,
      ICAO_WECHAT_APP_ID: 'review-only-native-app-id',
      ICAO_WECHAT_UNIVERSAL_LINK: 'https://native.example.invalid/app/',
    });
    if (JSON.stringify(baseConfigured) !== JSON.stringify(currentConfigured)) {
      throw new Error('app.config.js changes more than the reviewed Native WeChat config plugin');
    }
  }
  if (JSON.stringify(webPackageSurface(basePackage)) !== JSON.stringify(webPackageSurface(currentPackage))) {
    throw new Error('package.json changes the Web dependency or script surface');
  }
  const typescript = require('typescript');
  const transpile = (source) => typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.ESNext,
      removeComments: true,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText.trim();
  if (transpile(baseContracts) !== transpile(currentContracts)) {
    throw new Error('contracts index changes emitted Web runtime JavaScript');
  }
  return { contentChanged: changedProtectedPaths };
}

async function currentHead() {
  try {
    const { stdout } = await execFile('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function makeSnapshot() {
  const selection = await collectCurrentSelection();
  const fingerprint = await fingerprintSelection(selection);
  return {
    schemaVersion: 1,
    scope: 'existing-vercel-web-source-and-export-inputs',
    baseline: {
      capturedAt: new Date().toISOString(),
      repositoryHead: await currentHead(),
      workingTreeMode: 'exact-current-files-including-uncommitted-state',
      remoteProductionDeploymentVerified: false,
    },
    selection: {
      webGraph: {
        entry: 'index.js',
        platform: 'web',
        routerRoot: 'src/app',
      },
      exactPaths: exactProtectedPaths,
      trees: protectedTrees,
      additionalRules: [
        'src/**/*.web.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
        'scripts/**/* whose basename contains web or promo',
        'tools/**/* whose basename contains web or promo, excluding tools/check-web-freeze.mjs',
      ],
    },
    fileCount: fingerprint.files.length,
    combinedSha256: fingerprint.combinedSha256,
    files: fingerprint.files,
  };
}

function parseArguments(argv) {
  let mode = 'check';
  let explain = false;
  let manifestPath = defaultManifestPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--print-snapshot') {
      mode = 'print-snapshot';
      continue;
    }
    if (argument === '--explain') {
      explain = true;
      continue;
    }
    if (argument === '--manifest') {
      const value = argv[index + 1];
      if (!value) throw new Error('--manifest requires a path');
      manifestPath = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { mode, explain, manifestPath };
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) {
    throw new Error('Unsupported or missing Web freeze manifest schemaVersion');
  }
  if (!Array.isArray(manifest.files) || typeof manifest.combinedSha256 !== 'string') {
    throw new Error('Invalid Web freeze manifest structure');
  }

  const seen = new Set();
  for (const file of manifest.files) {
    if (
      typeof file?.path !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(file.sha256) ||
      !Array.isArray(file.sources)
    ) {
      throw new Error(`Invalid Web freeze manifest file entry: ${JSON.stringify(file)}`);
    }
    fromRepositoryPath(file.path);
    if (seen.has(file.path)) {
      throw new Error(`Duplicate Web freeze manifest path: ${file.path}`);
    }
    seen.add(file.path);
  }
  if (manifest.fileCount !== manifest.files.length) {
    throw new Error('Web freeze manifest fileCount does not match files length');
  }
}

function sourceCounts(files) {
  const counts = new Map();
  for (const file of files) {
    for (const source of file.sources) {
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function checkManifest(manifestPath, explain) {
  const manifestContent = await readFile(manifestPath);
  if (
    path.resolve(manifestPath) === path.resolve(defaultManifestPath) &&
    sha256(manifestContent) !== approvedManifestSha256
  ) {
    throw new Error(
      'Approved Web freeze manifest changed. Review the Web/Vercel impact before updating both the manifest and its pinned digest.',
    );
  }
  const manifest = JSON.parse(manifestContent.toString('utf8'));
  validateManifest(manifest);

  const fingerprinted = await fingerprintSelection(await collectCurrentSelection());
  const expected = manifest.files;
  const approvedContentPaths = [];
  const reviewedFiles = path.resolve(manifestPath) === path.resolve(defaultManifestPath)
    ? normalizeReviewedFormalWebInputs(expected, fingerprinted.files) : fingerprinted.files;
  const files = reviewedFiles.map((file) => {
    const baseline = expected.find((entry) => entry.path === file.path);
    if (path.resolve(manifestPath) === path.resolve(defaultManifestPath)
      && baseline && (approved900ContentHashes.get(file.path) === file.sha256
        || (file.path === 'src/features/question-bank/data/question-bank.json'
          && file.sha256 === reviewedLegacyQuestionRemovalHash))) {
      approvedContentPaths.push(file.path);
      return { ...file, sha256: baseline.sha256 };
    }
    return file;
  });
  const current = { ...fingerprinted, files, combinedSha256: combinedSha256(files) };
  if (approvedContentPaths.length) console.log(`User-approved 900-sentence content artifacts: ${approvedContentPaths.join(', ')}`);
  const {
    contentChanged,
    ownershipChanged,
    selectionAdded,
    selectionRemoved,
  } = fingerprintDifferences(expected, current.files);
  const combinedChanged = combinedSha256(expected) !== current.combinedSha256;

  const failures = [
    ['newly protected path', selectionAdded],
    ['path removed from protected selection', selectionRemoved],
    ['content changed', contentChanged],
    ['protection source changed', ownershipChanged],
  ];
  const hasFailure = combinedChanged || failures.some(([, paths]) => paths.length > 0);

  if (hasFailure) {
    if (path.resolve(manifestPath) === path.resolve(defaultManifestPath)
      && contentChanged.includes(reviewedStudyNativePath)) {
      try {
        const reviewedChanges = assertReviewedNativeStudyRouteDelta(expected, current.files);
        if (reviewedChanges.includes('app.json')) {
          const baseApp = await readNativeBuildReference(expected.find((file) => file.path === 'app.json')?.sha256);
          assertNativeBuildOnlyAppJsonDelta(baseApp, JSON.parse(await readFile(fromRepositoryPath('app.json'), 'utf8')));
        }
        console.log(`Web freeze check passed: ${current.files.length - reviewedChanges.length} protected files match the baseline exactly; one exact reviewed Native study route delta, unchanged Web sibling and verified Native build identifiers.`);
        return;
      } catch (error) {
        console.error(`Reviewed Native study route proof failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (
      path.resolve(manifestPath) === path.resolve(defaultManifestPath)
      && contentChanged.length === 1 && contentChanged[0] === 'app.json'
      && ownershipChanged.length === 0 && selectionAdded.length === 0 && selectionRemoved.length === 0
    ) {
      try {
        const baseApp = await readNativeBuildReference(expected.find((file) => file.path === 'app.json')?.sha256);
        assertNativeBuildOnlyAppJsonDelta(baseApp, JSON.parse(await readFile(fromRepositoryPath('app.json'), 'utf8')));
        console.log(`Web freeze check passed: ${current.files.length - 1} protected files match the baseline exactly; app.json differs only in matching advanced Native build identifiers.`);
        return;
      } catch (error) {
        console.error(`Native build identifier proof failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (path.resolve(manifestPath) === path.resolve(defaultManifestPath)) {
      try {
        const increment = await assertApprovedNativeIncrement(current.files);
        console.log(
          `Web freeze check passed by strict Native-only increment proof from ${approvedNativeIncrementBase}: ${current.files.length} protected files, ${increment.contentChanged.length} exact reviewed deltas.`,
        );
        if (explain) {
          for (const repositoryPath of increment.contentChanged) {
            console.log(`- reviewed Native-only protected input: ${repositoryPath}`);
          }
          console.log('- app.config.js: identical after removing the Native WeChat config plugin');
          console.log('- app.json: identical after removing the matching Native build identifiers');
          console.log('- package.json: identical Web dependency and Web script surface');
          console.log('- contracts index: identical emitted JavaScript');
          console.log('- pnpm lockfile: exact reviewed digest');
        }
        return;
      } catch (error) {
        console.error(`Strict Native-only increment proof failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.error('Web freeze check failed. Existing Web/Vercel inputs no longer match the approved baseline.');
    for (const [label, paths] of failures) {
      for (const repositoryPath of paths) console.error(`- ${label}: ${repositoryPath}`);
    }
    if (combinedChanged && failures.every(([, paths]) => paths.length === 0)) {
      console.error('- combined manifest digest differs; inspect manifest integrity');
    }
    if (process.env.VERCEL && contentChanged.includes('vercel.json')) {
      const observedConfig = canonicalJson(
        JSON.parse((await readFile(fromRepositoryPath('vercel.json'))).toString('utf8')),
      );
      console.error(`- observed Vercel build config: ${JSON.stringify(observedConfig)}`);
    }
    console.error('Do not rebaseline without explicit review of the Web/Vercel impact.');
    process.exitCode = 1;
    return;
  }

  console.log(`Web freeze check passed: ${current.files.length} protected files match the baseline.`);
  if (explain) {
    console.log(`Combined SHA-256: ${current.combinedSha256}`);
    for (const [source, count] of sourceCounts(current.files)) {
      console.log(`- ${source}: ${count}`);
    }
  }
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.mode === 'print-snapshot') {
    console.log(JSON.stringify(await makeSnapshot(), null, 2));
    return;
  }
  await checkManifest(arguments_.manifestPath, arguments_.explain);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Web freeze check could not run: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
