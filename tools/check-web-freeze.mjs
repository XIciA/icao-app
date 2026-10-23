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
const reviewedStudyNativeHash = '2b177e658925a57f5be28d7a17f2240b4a3559afed8312f23b472fb7bb12c296';
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

// 2026-10-18 reviewed Native/EdgeOne PDF glyph repair, approved airline C, and tap recording.
// Existing router selection keeps PDF/airlines unselected on Vercel; the EdgeOne bridge
// remains guarded by edgeone-production. app.json only advances the Native build IDs.
// 2026-10-17 Native/EdgeOne feature update: exact reviewed inputs only.
// Legacy route siblings, legacy snapshots, version.web.ts and Vercel configuration remain unchanged.
// PDF/font/catalog dependencies belong to the unselected native catalog route; the
// installed router selection is tested. Download changes run behind the existing
// EdgeOne guard. New PDF dependencies preserve all previously locked versions.
reviewedFormalWebHashes.set("assets/fonts/NotoSerifSC_600SemiBold.ttf", [null, "73bb1df903dc81dc528153b40c5602e516005482723255f6767e72281e317821"]);
reviewedFormalWebHashes.set("src/app/question-bank/[bankId]/index.native.tsx", [null, "554e028b7b24f0edef94206bb9c0512d6c97d9d29b0a7893d114af7a8600731b"]);
reviewedFormalWebHashes.set("src/features/app-updates/update-model.ts", [null, "722815395cf0fb511c4fa3d3c83c27d299e207156d8fa6a7059b31e612109e8d"]);
reviewedFormalWebHashes.set("src/features/question-bank/components/AirlineMark.tsx", [null, "e52a9854b098cec0700ab59db975424e4e60482dae855519c0887aa5b159e4de"]);
reviewedFormalWebHashes.set("src/features/question-bank/components/QuestionBankCatalog.native.tsx", [null, "41d33be6a4234d4aeb96f88b299cced4dff0a8b4a71d808193a698ebbc18ac9d"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/question-bank-public-release.json", [null, "5f95032a6ab3c37bf1d9ef36f24397ad6d2bb644ba196aa0cdfcf8a07b1fa2c6"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/question-bank-public.json", [null, "8cb210a06d26fba8bcd8160d2914d532435f768264193789527406f809e450db"]);
reviewedFormalWebHashes.set("src/features/question-bank/export/SentenceExportScreen.tsx", [null, "0dcc76e9fd163f8e486caf3609079d1a473ea88e7ddb9755556b873a2ed8e480"]);
// PDF loader is reachable only from the existing Native/EdgeOne export screen.
reviewedFormalWebHashes.set("src/features/question-bank/export/pdf-generator.ts", [null, "e8a9949493a679aaac20e5d6da437354d1477ef12a7896c2ada4013468602a7e"]);
reviewedFormalWebHashes.set("src/features/question-bank/export/export-model.ts", [null, "6bb6d98076ec1098b36c3876d47002f4f14c8d44504ca54bd3133aa257bd82fc"]);
reviewedFormalWebHashes.set("src/features/question-bank/export/pdf-platform.web.ts", [null, "50c7da311aaa05afc0d87b937348162c14324aa123ec27ef8dc36dcfcf8f70a1"]);
reviewedFormalWebHashes.set("src/features/question-bank/export/sentences-pdf.ts", [null, "4accd0a5ec6e53d3e6b9c95302b937340a893709ed0cbef96aafb44afef2b53f"]);
reviewedFormalWebHashes.set("src/features/question-bank/lib/study-scope.ts", [null, "8b0e531aec596be883cf3a5355430ad9d5bc02afc4dca19b572f3d3a9bf045a3"]);
reviewedFormalWebHashes.set("src/features/question-bank/platform/learning-store.native.ts", [null, "70e8893800737cb12a8f1428105e47cf2ee57c361a9a6262ebbcc1e968668579"]);
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [null, "eac98ef5283f7e0952aba218cd19c08ddfb3d4babb44c0c5bd0bd4f66eb0c865"]);
reviewedFormalWebHashes.set("app.config.js", ["a17b33af850819c55e67534656a4e6f0efb858b6d6841caf82ce8dc8db6589b2", "f88c41ace896bad43495808b75f2dbf522ea1f0675a177958fc317117b7e106a"]);
// Usage-guide release: exact 1.3.2 / 3574504 metadata only. Legacy display
// still resolves the unchanged app-version.web.ts (1.0.0). All other app.json
// bytes match the previously reviewed 1.3.1 / 3574503 configuration.
// User-authorized daily-hotspot App release 1.3.3 / 3574505; only expo.version and
// matching native build IDs differ from ef6d16cb. Legacy Web version source is unchanged.
reviewedFormalWebHashes.set("app.json", ["255bfdaf744cc57b0d402c255ce67e7a157587e5a6eb579010c3b397b18d53c3", "a110f1040ef4f9b8f2facc2d10b2c82f05f563d2ae0ce0b9bcdabadda3f83ced", "cdae79062c444e931f100a60d0881217ebd826a1dda1280e14a43ff113519d0c", "1aa3d48a88d0284e3d62cb3a5c8819be3b8787578a1661132997337f2708bac7"]);
reviewedFormalWebHashes.set("package.json", ["cee4cb5ab75e040dd58134578fb1001197f46747acb815219022848810a37c5e", "188be10136c308d53b13be0351d92a5a6d7db3ec54e5d0e7937f78e54fb242bd"]);
reviewedFormalWebHashes.set("packages/contracts/src/index.ts", ["8f5607cd2cda4757a61894797a6f36b8d3f40248ae57206268d3c95562e2add4", "19eed3ec1891088e0b21e428162150a9429efd2ac757d822097ba9146b920360"]);
reviewedFormalWebHashes.set("pnpm-lock.yaml", ["96bfa611b82a49b435aed6f477a788cb2efb0b78c776507ef78c155d9750fab9", "78864173822a160e01e84db91ef6df5d61a1608c6830770d1a1cac35c187212b"]);
reviewedFormalWebHashes.set("src/components/ui/icons.ts", ["f4901f9193f07c3a9299371f5aa1173389ec1dc5c531645dca1152c780f504d0", "6b26cc5ac53e12cfdf083c8676e532ea28558cd19e8b8a8b6e321989ab28a805"]);
reviewedFormalWebHashes.set("src/features/content/AppDownloadScreen.tsx", ["87b29194e178462bdc81f85c264fa3e12be9027846c6c1264441eeabf9fa6947", "a91390f8c6c2aee2a56c019f9d1880d34332fb7ccbe2bb988b2ad7e34aeb7d84", "f2c7c33d4d518e2861d358e3b5416ee66976c6a773ded7044fda7ca0d7a672d0"]);
// Guide overlay exact reviewed bytes: formal provider is mounted only in the Native/EdgeOne layout.
// Shared controls render their original host tree without that provider; no legacy layout, content or runtime config changes.
reviewedFormalWebHashes.set("app.json", [...new Set([...(reviewedFormalWebHashes.get("app.json") ?? ["cdae79062c444e931f100a60d0881217ebd826a1dda1280e14a43ff113519d0c"]), "1aa3d48a88d0284e3d62cb3a5c8819be3b8787578a1661132997337f2708bac7"])]);
reviewedFormalWebHashes.set("src/app/_layout.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/app/_layout.native.tsx") ?? ["d2b9ab2e37b46b5811dafc740346efd16b39870f8eed212349fd12336f6b7fca"]), "6feebb0650e4b797a6e689050fc64ffbb3900c890c7e4c8d1c3ba57bcd1a8d7d"])]);
reviewedFormalWebHashes.set("src/components/ui/Button.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/components/ui/Button.tsx") ?? ["629961258b37beae2993711f89b4e39b8b37d12da65b492ce42edd7cdb8ffc0a"]), "155b2b3c57cd7359fad1e83148c91ec11dd768bc545d5561844aab993fa4ce74"])]);
reviewedFormalWebHashes.set("src/features/content/RadioPlayerScreen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/content/RadioPlayerScreen.tsx") ?? ["da7d2cb6d7f54428fef93d6620325a1187691f4a25371fec8023132c969f049d"]), "9faa7958978ef174d1dfb2a295ffab48c94c02210e6a8e6ac0cb416e57b819ba"])]);
reviewedFormalWebHashes.set("src/features/editorial/EditorialArticleScreen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/editorial/EditorialArticleScreen.tsx") ?? ["9170766c3d47e35ba106c60e2d40b50bf3611b65cc65750b4f3bbc7985b64c90"]), "3687ac6ae1ed7e60b73594bd33c59b7b501fd3393ffc8e4f52d70023bd56cbf2"])]);
reviewedFormalWebHashes.set("src/features/editorial/ResourceEditorialScreen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/editorial/ResourceEditorialScreen.tsx") ?? ["51ad9003e341698000a7b4dbf0cb441dbd6122def89658b53bf67e42c60cafae"]), "60c6c44754dddb0ccfdaa84a863efa06759b64b2605f2cc1835087eab77fa91a"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/QuestionBankSwitcherHeader.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/QuestionBankSwitcherHeader.tsx") ?? ["a24c9202c1b53f437a86a9e43ef2ca0765aae8002f225ff873f060c219a32a24"]), "c4a11ad531df28710521215e350743d230454e2c965e81a27a9593f867bb24ed"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/StudyWorkbench.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/StudyWorkbench.tsx") ?? ["2654f912edba1c017a4ee563d3dabb1d8c2a587185ebd5e053468223ea9ab9b9"]), "b4e44155a4e4ec2fab88b03f9a126c400405ef50e5c722ef743ed489d75ac263"])]);
reviewedFormalWebHashes.set("src/features/vocabulary/components/VocabularyLibraryViews.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/vocabulary/components/VocabularyLibraryViews.tsx") ?? ["11d3478885c80f911ddc0b6325eaa5dc5faab45b12f765fdde036fb0274f0b3b"]), "b6e40196f0046766f45fbf616ceaa327769e77b9147542515f0cd99be5ef5973"])]);
reviewedFormalWebHashes.set("src/features/vocabulary/components/VocabularyStudyViews.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/vocabulary/components/VocabularyStudyViews.tsx") ?? ["9576d18bdb0726740280e042dbb1a6bb6bfe4be60c5eb6381a5b9249ebcf18fc"]), "b759ee645376e1924d3e04278c83e5a8eff00bb070adf54ac7a6f94d1d3a54b7"])]);
reviewedFormalWebHashes.set("src/features/question-bank/export/SentenceExportScreen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/export/SentenceExportScreen.tsx") ?? ["0dcc76e9fd163f8e486caf3609079d1a473ea88e7ddb9755556b873a2ed8e480"]), "4c219721715b2773e92118b959aad642e8c4a832711d7112864374fad041be87"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideBindings.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideBindings.tsx") ?? [null]), "7e47567036f51d09d3f3012881ff421b8522c3e388650bc7fdb85ded73908f3a"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideOverlay.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideOverlay.tsx") ?? [null]), "d6ccc050b28e08eb081d0ee25fc0348f042a864d5e400e40d1e50154d61ac711"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideRootSurface.web.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideRootSurface.web.tsx") ?? [null]), "296cc9d744bd84fba05c0c9cf06fef9621ccd1dcb12fe4e065ecbc4a708a6021"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideTourProvider.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideTourProvider.tsx") ?? [null]), "65ce503d6c1eccc279c59b0235329ab1dfef432afc27cfe2f4e7a50c3e93be9a"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/guide-flows.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/guide-flows.ts") ?? [null]), "71a2e50d904ec330cda501cff8750633d8a9ca7dbb7aeee7b49a1d484590e9ce"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/guide-placement.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/guide-placement.ts") ?? [null]), "035d5fd5883e760260f481c22224d4295f5650b15663e8d4390938c2cea08177"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/guide-progress.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/guide-progress.ts") ?? [null]), "c2b4c3412d5100ce653c01f92d6bac56e6ebe28107588193d5abfefc34a18d2b"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/StudyAudioPlayer.web.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/StudyAudioPlayer.web.tsx") ?? ["f8c96ffdd0e4beb50c079062729dbd9a649c585ad45a5abce18e34b614cefb03"]), "6aa2f1701f6e5ea8fc1882161e15709f8120f6e3b4b79113261b96e7e1d79a7c"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/StudyScopeSelector.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/StudyScopeSelector.tsx") ?? ["6bbc072a12c638300ef78632d0eaa6df642b548da11d1e0a2181d92b0310dc54"]), "ae869b86ae4f5b3ca29ff8e2edfe1cb0fa2d5d68413ff7d1a6fe2d8630ab8663"])]);
reviewedFormalWebHashes.set("src/features/account/profile-store.native.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/account/profile-store.native.ts") ?? ["16a8cc5e31a9a6b1774b126cbebc02a32727ea11714416efde4c8a3929592ca2"]), "89c99c25f94d6aef40b7ca475df8592cd1e7382a1b9c2503bc65c9df66592d60"])]);
// App guide 1.3.4: provider is absent on legacy Web; GuideScrollView returns
// the original ScrollView props/event identities outside a tour (regression tested).
// Export/overlay/provider changes execute only in the existing Native/EdgeOne guide.
// app.json changes only marketing/native build identifiers; app-version.web.ts is unchanged.
reviewedFormalWebHashes.set("app.json", [...new Set([...(reviewedFormalWebHashes.get("app.json") ?? ["255bfdaf744cc57b0d402c255ce67e7a157587e5a6eb579010c3b397b18d53c3"]), "83d5e78ba78027e4896fc4824d59ce079356366f199bb83974ff60375490abdb"])]);
reviewedFormalWebHashes.set("src/components/ui/Screen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/components/ui/Screen.tsx") ?? ["d2a1a9b08518010120aadbda6e8a9dc4bde5e051557e2a410e96a087c6ce1482"]), "ba275246e649ba921a17c80f9a4bdd6aaf6a624c6134618bc437f3dea8f000dd"])]);
reviewedFormalWebHashes.set("src/features/vocabulary/components/VocabularyLibraryViews.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/vocabulary/components/VocabularyLibraryViews.tsx") ?? ["11d3478885c80f911ddc0b6325eaa5dc5faab45b12f765fdde036fb0274f0b3b"]), "792e50601287e956c71e8832b841a865592809f9f81e20840f06ae88b4dfb248"])]);
reviewedFormalWebHashes.set("src/features/question-bank/export/SentenceExportScreen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/export/SentenceExportScreen.tsx") ?? [null]), "0672ad40173be72377d37bf5f4b9a09e01f814eab2d5ed7563fc6fb37943dcc2"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideBindings.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideBindings.tsx") ?? [null]), "64051aa06d81052ba83ae24942c5768faf28be33b2334029c42c2a3e1b24fdd6"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideOverlay.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideOverlay.tsx") ?? [null]), "50ddea88e741e92fbc58b73771fd84a16027850ae82486209fbb4f6e571b8932"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideTourProvider.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideTourProvider.tsx") ?? [null]), "9497d87a9c364a05e03f498a22220000fd3df00e7137aa31cb99096e2cd60bfd"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/guide-flows.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/guide-flows.ts") ?? [null]), "c896d49e01f92eca96079e6b82b4bad713de621d89adbb5ae33544bfd9bdcb3a"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/guide-placement.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/guide-placement.ts") ?? [null]), "feafe081bd99bb8ea7b1149edcdb1586a137cb2394df780d2a5d8ef96deabab1"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideScrollView.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideScrollView.tsx") ?? [null]), "fd783b4752ad21682dbacd6d923291ed8a2ac0f7d01cb43161dd6b645e0f3f20"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/guide-scroll-context.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/guide-scroll-context.ts") ?? [null]), "a75708430d27d3194d5db678621f02c7f8eda460a7e55fb4d1d42db08fcbba04"])]);
reviewedFormalWebHashes.set("src/features/content/RadioPlayerScreen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/content/RadioPlayerScreen.tsx") ?? []), "f82e18ce0c027317de2a0edf8e61825eca118c841f0582d7f7b417d16ffb057f"])]);
// Unified 1.2.1 release: only native marketing/build metadata changes; frozen Web stays on its existing version module.
reviewedFormalWebHashes.set("app.json", [...new Set([...(reviewedFormalWebHashes.get("app.json") ?? []), "a43e706beec0ee7a3a592fc9cf02b38efd75edea288c6d491392dcfcdc154c37"])]);
// 2026-10-22 user-authorized App content formatting/reorder. The legacy bank
// snapshot, Vercel routes/build commands and app-version.web.ts are unchanged.
// Public catalogs and scope logic are selected only by the Native/EdgeOne
// repository path; require.context still inventories these exact files.
reviewedFormalWebHashes.set("app.json", [...new Set([...(reviewedFormalWebHashes.get("app.json") ?? []), "04d33f4a496b5a8d79c31cb4b0dd13c0174fbbb9e19c05d52178a9275b8c0aa0"])]);
reviewedFormalWebHashes.set("package.json", [...new Set([...(reviewedFormalWebHashes.get("package.json") ?? []), "ec44e0f28beda97592d17934c6d3d089c78f26424479681c3cfc4c1dcb608cac"])]);
reviewedFormalWebHashes.set("src/features/question-bank/data/question-bank-public.json", [null, "e0fda83acd34edfbc0e9128c1c58dae794b218c6de953097b7e3e037f6066f44"]);
reviewedFormalWebHashes.set("src/features/question-bank/data/question-bank-public-release.json", [null, "14fa89397036a2941ad556c24ddcfbbe662ae88af96b85a3333e38a419396b77"]);
reviewedFormalWebHashes.set("src/features/question-bank/lib/study-scope.ts", [null, "71b95604abe64314989878dce3ceccaa4ef4f3c2a77e3deef0685e605ad31435"]);
// End guide overlay exact pins

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
// 2026-10-22: user-requested Native navigation repair. Shared legacy screens
// remain byte-identical; Native variants carry the toolbar, radio and list changes.
// Existing installed-router tests prove the root/catalog/study Web siblings remain
// selected. The only new shared dependency forwards Expo Router without a guard.
reviewedFormalWebHashes.set("src/app/_layout.native.tsx", [null, "5dc9c8fbb575dec1447b0ec2f20f45cb15be0733c2a0f696c49cf0eb33b79668"]);
reviewedFormalWebHashes.set("src/features/question-bank/components/QuestionBankCatalog.native.tsx", [null, "e900b27c08ca5ddc10c19379381eecf912e1aea07e31c4ed969855e3b7205473"]);
reviewedFormalWebHashes.set("src/components/navigation/useAppRouter.ts", [null, "a47ad6396c5f3efa5d3586386bc55ae6c7bcc7bac45a5b9c925331c40bc23194"]);

// Native route handlers now share tap protection; the Web sibling is unchanged.
reviewedFormalWebHashes.set("src/app/content/[slug].native.tsx", [...(reviewedFormalWebHashes.get("src/app/content/[slug].native.tsx") ?? ["acfd42af3f57657d0e64e3011348c8a94eb5b15df47d493fe3753c50eea35b86"]), "f7f0f6d2941b14786baf86a0461f89e9b8760a1bbed639a56f1242d80de42aef"]);

// Account/info dynamic route identities affect only the Native stack.
reviewedFormalWebHashes.set("src/app/_layout.native.tsx", [...(reviewedFormalWebHashes.get("src/app/_layout.native.tsx") ?? [null]), "aa2bb9a438451bf99071555059f03607b6602b81e3e11e0a53d6f2e63a5fe2ce"]);

// Native-only identity helper is reachable solely from _layout.native.tsx.
reviewedFormalWebHashes.set("src/app/_layout.native.tsx", [...(reviewedFormalWebHashes.get("src/app/_layout.native.tsx") ?? [null]), "65a5782979582d079c1c7ba0d5bb5040793be64aecd259cc7bbc102702233ce4"]);
reviewedFormalWebHashes.set("src/components/navigation/route-identity.native.ts", [...(reviewedFormalWebHashes.get("src/components/navigation/route-identity.native.ts") ?? [null]), "ce3fef84089154a0311401de60ccd3d24d2f3cf3c464d556fc45dd71eb7ddf60"]);

const webImplementationPattern = /\.web\.(?:[cm]?[jt]sx?)$/u;

// User-approved B startup across Native and EdgeOne; legacy renderer and injector stay unchanged.
reviewedFormalWebHashes.set("app.json", [...new Set([...(reviewedFormalWebHashes.get("app.json") ?? [null]), "4e1931371a2b7e7e5d0b7000882f248cd1f4e08543a4c58b2e1cccbd574fb366"])]);
reviewedFormalWebHashes.set("package.json", [...new Set([...(reviewedFormalWebHashes.get("package.json") ?? [null]), "0a9d8424f12dd09705fa8bc5fce2075c3463bc3f9afca1bd58e9a1b29d7f07f2"])]);
reviewedFormalWebHashes.set("src/app/_layout.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/app/_layout.native.tsx") ?? [null]), "b43bee04dacbf5d9aeca6b7a1f75daba70c4daaf64ca094eccd73cbd7c53a96b"])]);
reviewedFormalWebHashes.set("assets/images/startup-brand.png", [...new Set([...(reviewedFormalWebHashes.get("assets/images/startup-brand.png") ?? [null]), "e165261b71814f711a8610c733d5fc2ed36e590bdca6b9a148d06d0c33900f22"])]);
reviewedFormalWebHashes.set("src/components/states/StartupBrandScreen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/components/states/StartupBrandScreen.tsx") ?? [null]), "bd8b43fa36d9841574ecf2121d9d49dc19efd0110ce1620f4f40b4f59e15d275"])]);

// Android 1.2.1 installer release advances only Android versionCode; iOS 3576434 and legacy Web stay fixed.
reviewedFormalWebHashes.set("app.json", [...new Set([...(reviewedFormalWebHashes.get("app.json") ?? [null]), "f8cacb4271315ce54305ef241c5a7b2f7d1169f0bb75f98c32ae98635038600e"])]);

// 2026-10-22 unified teaching: exact Native/formal EdgeOne dependencies.
// Frozen Web layout/download siblings remain byte-identical and selected on legacy Web.
reviewedFormalWebHashes.set("app.json", [...new Set([...(reviewedFormalWebHashes.get("app.json") ?? [null]), "ebded6341791acd9260f881666a0a3af8b85bff23d1077c666bdcfaa618af0a0"])]);
reviewedFormalWebHashes.set("src/app/_layout.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/app/_layout.native.tsx") ?? [null]), "cb84aa7e7d038dc673ff50abe00209aeb2a87d98bcbc4ca88e1d017da71eb9f2"])]);
reviewedFormalWebHashes.set("src/features/question-bank/export/SentenceExportScreen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/export/SentenceExportScreen.tsx") ?? [null]), "8095b874da959aa9d9b542f0220c38719794b88d6b3e69a67a4f51c171eae10b"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideBindings.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideBindings.tsx") ?? [null]), "9ca5a114e3f3d7e5cdce21636ce69b14b67fa777b79536becbae495c2df6d14e"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideOverlay.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideOverlay.tsx") ?? [null]), "0bca6343bbbaaf6449b4c2a268f54a552f4b98a1a928ed575fe2f6791f53d2bc"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideScrollView.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideScrollView.tsx") ?? [null]), "d049367612371c3a0415d0db6a835785b38ebf1068282d92d05e54c97a0691f9"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideTourProvider.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideTourProvider.tsx") ?? [null]), "a7166af45a47770c2e29f0143741bcff029487887ee401eb514c11f97cb4741a"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/guide-flows.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/guide-flows.ts") ?? [null]), "e5e2bd35d399a2354505cc5f31907042efd78bbd71f3e4fcacbad57200a4ab66"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/guide-placement.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/guide-placement.ts") ?? [null]), "ee51f418eb2558b14d26294e581a9ba658568db22b20f4155b2172614846e9b9"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/guide-progress.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/guide-progress.ts") ?? [null]), "51ed8d39b34d05b8e495bacfb0d2ead57444f86dd3baa4a7440e113ff8b8fc79"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/tutorial-model.ts", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/tutorial-model.ts") ?? [null]), "091c67ee58bdcf0cd1124e64f8d0ca9349819fd532bd7e5613e9f4aa3d78a089"])]);
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [...new Set([...(reviewedFormalWebHashes.get("tools/edgeone-shared-modules.cjs") ?? [null]), "a96b7e9da47b6f12893f3b29f8da88e8fa64c15d599e323e5eedbc0e4d84ecf8"])]);

// 2026-10-22: formal EdgeOne navigation adapters only. Resolver tests prove
// every mapping is bypassed for Vercel; legacy module sources remain unchanged.
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [...new Set([...(reviewedFormalWebHashes.get("tools/edgeone-shared-modules.cjs") ?? [null]), "16ae62b15a25be92cb68ebcdf1d5821c08eaa1a186c4faf07d58f431e2859253"])]);

// User-requested 1.2.2 candidate: only marketing version and build identifiers
// change; the legacy Web display version remains frozen at 1.0.0.
reviewedFormalWebHashes.set("app.json", [...new Set([...(reviewedFormalWebHashes.get("app.json") ?? [null]), "d0796787d159446436e5db631b062f633adc7902a645e4c73399d99f59d2e05e"])]);
// Reviewed 2026-10-22: user-selected E icons on Native/formal EdgeOne only.
// Lucide re-exports are byte-identical; Native icon containers are lighter.
// Account/vocabulary views are EdgeOne mapped; shared styles retain legacy branches.
// Exact bytes only: no Vercel page or manifest is rebaselined.
reviewedFormalWebHashes.set("src/components/ui/icons.ts", [...new Set([...(reviewedFormalWebHashes.get("src/components/ui/icons.ts") ?? ["f4901f9193f07c3a9299371f5aa1173389ec1dc5c531645dca1152c780f504d0"]), "03b9fe5278c8892888b3b8c69ebed2087fb742f4085c1828c68bd42ada446c7b"])]);
reviewedFormalWebHashes.set("src/components/ui/lucide-icons.ts", [...new Set([...(reviewedFormalWebHashes.get("src/components/ui/lucide-icons.ts") ?? [null]), "6b26cc5ac53e12cfdf083c8676e532ea28558cd19e8b8a8b6e321989ab28a805"])]);
reviewedFormalWebHashes.set("src/components/ui/light-icons.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/components/ui/light-icons.tsx") ?? [null]), "469334c81da81c272ece6411f9904f43c078841e1341261307fd7107ad967cd5"])]);
reviewedFormalWebHashes.set("src/components/navigation/FloatingTabBar.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/components/navigation/FloatingTabBar.tsx") ?? ["c06a968802279863c22a201b549f18b36e1b347899ff8bf84d7d3f39680ed898"]), "cf78f32ec17d805529e72aa81f707b4a71323ad49d46d3eb1f23d62fb696b838"])]);
reviewedFormalWebHashes.set("src/theme/tokens.ts", [...new Set([...(reviewedFormalWebHashes.get("src/theme/tokens.ts") ?? ["a12723112d79fb8ce78395ebea79ae2057f8cedfde0788b7cfa5b55a9e0e22fb"]), "24b7e8a7e97304dc7a69bde85ebed0ca998c98eb901f9e341c40dcc4cfb1c027"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/QuestionBankCatalog.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/QuestionBankCatalog.native.tsx") ?? [null]), "cac5edc15abd071cd793bdb3a008170b5f24ad53e112ed55fb29bcf8bbeb399f"])]);
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [...new Set([...(reviewedFormalWebHashes.get("tools/edgeone-shared-modules.cjs") ?? [null]), "27b8939adc7f4fefa13780a37de5b1a5bfb0c18f5e03a784c2a853b5d17bccaa"])]);
reviewedFormalWebHashes.set("src/features/account/AccountScreen.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/account/AccountScreen.tsx") ?? [null]), "37634273a5ff292d6f259fc55f9a51657ab0587d3252bb15abce8216ca895290"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/QuestionBankSwitcherHeader.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/QuestionBankSwitcherHeader.tsx") ?? ["a24c9202c1b53f437a86a9e43ef2ca0765aae8002f225ff873f060c219a32a24"]), "3fead692e652a8fdc764bc01b296e39c58dbb5c920cd5079e6b4d189f2a5ee3d"])]);
reviewedFormalWebHashes.set("src/features/content/MockExamScreen.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/content/MockExamScreen.native.tsx") ?? [null]), "14b2d1d960245c2a861f18dd19b5c636f6faaeebb5c78a41598037c166b59091"])]);
reviewedFormalWebHashes.set("src/features/info/InfoScreen.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/info/InfoScreen.native.tsx") ?? [null]), "c8be57989872276c3a4c6578cfc31fe10a6609455b36aec3ff0b865ed65e92b6"])]);
reviewedFormalWebHashes.set("src/features/profile/ContactRow.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/profile/ContactRow.native.tsx") ?? [null]), "a12167e7d1222ac5a0e1f7e491f8a8d5136efd95f34044dd0013e80784f90f29"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/MyAnnotationsScreen.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/MyAnnotationsScreen.native.tsx") ?? [null]), "3cb774d488234bad36fbd5228a29e0ae0286184200c8918e2dcad1dfb78e46c5"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/LearningRecordsScreen.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/LearningRecordsScreen.native.tsx") ?? [null]), "359e96ddfa9ecaa19a7fb4e63a3319be0f80ca4de20dc354f9cb37d22461de17"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/StudyReport.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/StudyReport.native.tsx") ?? [null]), "3ec0bbe7753e1486339a6ac523a1b9ac853e836b41021b6c7276aa26bb23e3e9"])]);
reviewedFormalWebHashes.set("src/features/vocabulary/components/VocabularyLibraryViews.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/vocabulary/components/VocabularyLibraryViews.native.tsx") ?? [null]), "50d6b0cf34a0d65be6dab5fa4f2178103170fa9b4c7fe16b877db4144dcdd9ac"])]);


// Integrated E icons and navigation maps; legacy runtime remains unmapped.
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [...new Set([...(reviewedFormalWebHashes.get("tools/edgeone-shared-modules.cjs") ?? [null]), "a2d4ff233c7f2da3e692ad2ea04cdbbe119b868ef1941ca5ea77ced592a0c2ed"])]);
// Approved seven-page UI: exact formal-Web adapters; legacy siblings and runtime gate remain unchanged.
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [...new Set([...(reviewedFormalWebHashes.get("tools/edgeone-shared-modules.cjs") ?? [null]), "68eb8b44937e9be8c5a79380467ee6baa4fbf5572e0791f0f2a19b63d00c137d"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/MyAnnotationsScreen.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/MyAnnotationsScreen.native.tsx") ?? [null]), "6ee408e2f8180c7f02af528e42b0d7263cc8b51ddfebaf7a2710d24209f40952"])]);
reviewedFormalWebHashes.set("src/features/question-bank/components/StudyReport.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/question-bank/components/StudyReport.native.tsx") ?? [null]), "3a2f577f79b1806ddc8f4d7626d7741cf736c98ae94fa2a15044d803478a9e66"])]);

reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [...new Set([...(reviewedFormalWebHashes.get("tools/edgeone-shared-modules.cjs") ?? [null]), "0943a65e6a849ee08e58959ae260e5156b05bffe723dc5a3f992b4b549434919"])]);

// Guided tab pager repair: only formal surfaces with an active guide disable animation.
// Legacy Vercel still receives animationEnabled=true; provider is not mounted there.
reviewedFormalWebHashes.set("src/app/(tabs)/_layout.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/app/(tabs)/_layout.tsx") ?? ["fd5a80c19c26a902df5886dbee47df6c4498b9d95e7278cb5161686f0e7edcee"]), "a88f72520624410758bc85df55f4c4005de24552fc5f7a7e835b3a7d18d85e31"])]);
reviewedFormalWebHashes.set("src/features/usage-guide/GuideTourProvider.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/usage-guide/GuideTourProvider.tsx") ?? [null]), "9fc3108bf523635fc66f1d49e454a3b844b76cce9561c8cbff3d73cb1f3d9d2b"])]);

// User-requested icon rollback: remove only the formal EdgeOne native-icon override.
// All functional mappings remain; Vercel still bypasses this remapping entirely.
reviewedFormalWebHashes.set("tools/edgeone-shared-modules.cjs", [...new Set([...(reviewedFormalWebHashes.get("tools/edgeone-shared-modules.cjs") ?? [null]), "dedf7310c682a454173749d7f8f79880a87eca52018b173cda6d43aecb2a38d4"])]);

// Native completion labels follow local return origins; shared default text and legacy callers are unchanged.
reviewedFormalWebHashes.set("src/features/vocabulary/components/VocabularyStudyViews.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/features/vocabulary/components/VocabularyStudyViews.tsx") ?? [null]), "84d11ab643c8b0e82d25c31a27535a77e66bfb4990f8d3644d2bbb4d62449957"])]);

// iOS-only left-edge responder dispatches the existing navigation action; legacy Web root is unchanged.
reviewedFormalWebHashes.set("src/app/_layout.native.tsx", [...new Set([...(reviewedFormalWebHashes.get("src/app/_layout.native.tsx") ?? [null]), "7c68ed321bc47930ad16383ad9b441c47e1118364545fde4f08c35abae379c9e"])]);

reviewedFormalWebHashes.set("src/components/navigation/EdgeBackRegion.native.tsx", [null, "d2e2f6e8376f15bbfc5272f283ccef9c64ffdc28d5f81e9a4967b756cbda5534"]);

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
