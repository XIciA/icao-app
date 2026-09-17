// The formal web app shares product logic with the apps. Browser storage, audio,
// media and UI adapters still resolve as web modules. Vercel is never remapped.
const path = require('node:path');
const sharedModules = {
  "src/features/radio-player/catalog.ts": "src/features/radio-player/catalog.browser.ts",
  "src/features/auth/AuthProvider.web.tsx": "src/features/auth/AuthProvider.tsx",
  "src/features/auth/auth-service.web.ts": "src/features/auth/auth-service.ts",
  "src/components/auth/login-screen.web.tsx": "src/components/auth/login-screen.native.tsx",
  "src/platform/api-client.web.ts": "src/platform/api-client.ts",
  "src/platform/AppRuntime.web.tsx": "src/platform/AppRuntime.tsx",
  "src/features/account/AccountScreen.web.tsx": "src/features/account/AccountScreen.tsx",
  "src/config/native-route-surface.ts": "src/config/native-route-surface.native.ts",
  "src/features/ai/ai-client.web.ts": "src/features/ai/ai-client.native.ts",
  "src/features/ai/transcription-ui-capability.web.ts": "src/features/ai/transcription-ui-capability.ts",
  "src/features/editorial/repository.web.ts": "src/features/editorial/repository.native.ts",
  "src/features/question-bank/data/member-content-cache.ts": "src/features/question-bank/data/member-content-cache.browser.ts",
  "src/features/question-bank/data/member-content-cache.native.ts": "src/features/question-bank/data/member-content-cache.browser.ts",
  "src/app/question-bank/[bankId]/study/[categoryId]/[topicId].tsx": "src/app/question-bank/[bankId]/study/[categoryId]/[topicId].native.tsx",
  "src/features/sync/learning-sync.ts": "src/features/sync/learning-sync.native.ts",
  "src/features/account/profile-store.ts": "src/features/account/profile-store.native.ts",
  "src/features/question-bank/data/repository.ts": "src/features/question-bank/data/repository.native.ts",
  "src/features/question-bank/annotations/annotation-store.ts": "src/features/question-bank/annotations/annotation-store.native.ts",
  "src/features/question-bank/platform/learning-record-storage.ts": "src/features/question-bank/platform/learning-record-storage.native.ts",
  "src/features/question-bank/platform/learning-store.ts": "src/features/question-bank/platform/learning-store.native.ts",
  "src/features/question-bank/platform/remote-resource-service.ts": "src/features/question-bank/platform/remote-resource-service.native.ts",
  "src/features/question-bank/hooks/useQuestionBank.ts": "src/features/question-bank/hooks/useQuestionBank.native.ts",
  "src/features/question-bank/hooks/useStudySession.ts": "src/features/question-bank/hooks/useStudySession.native.ts",
  "src/features/native-commercial-testflight/commerce-environment.ts": "src/features/native-commercial-testflight/commerce-environment.native.ts",
  "src/features/ai/ai-operation-failure.ts": "src/features/ai/ai-operation-failure.native.ts",
  "src/features/editorial/use-editorial.ts": "src/features/editorial/use-editorial.native.ts",
  "src/features/content/hotspot/repository.ts": "src/features/content/hotspot/repository.native.ts",
  "src/features/question-bank/components/QuestionBankStudyScreen.tsx": "src/features/question-bank/components/QuestionBankStudyScreen.native.tsx",
  "src/features/question-bank/components/LearningRecordsScreen.tsx": "src/features/question-bank/components/LearningRecordsScreen.native.tsx",
  "src/features/question-bank/components/QuestionBankCatalog.tsx": "src/features/question-bank/components/QuestionBankCatalog.native.tsx",
  "src/features/question-bank/components/AnnotationToolbar.tsx": "src/features/question-bank/components/AnnotationToolbar.native.tsx",
  "src/features/content/MockExamScreen.tsx": "src/features/content/MockExamScreen.native.tsx",
  "src/features/content/DiscoverHomeScreen.tsx": "src/features/content/DiscoverHomeScreen.native.tsx",
  "src/features/profile/ProfileHomeScreen.tsx": "src/features/profile/ProfileHomeScreen.native.tsx",
  "src/features/content/hotspot/HotspotStudyScreen.tsx": "src/features/content/hotspot/HotspotStudyScreen.native.tsx",
  "src/features/content/hotspot/HotspotListScreen.tsx": "src/features/content/hotspot/HotspotListScreen.native.tsx",
  "src/features/content/hotspot/HotspotDetailScreen.tsx": "src/features/content/hotspot/HotspotDetailScreen.native.tsx",
  "src/features/info/InfoScreen.tsx": "src/features/info/InfoScreen.native.tsx"
};
function edgeOneSharedModule(root, resolution, platform, runtime) {
  if (platform !== 'web' || runtime !== 'edgeone-production' || resolution.type !== 'sourceFile') return resolution;
  const relative = path.relative(root, resolution.filePath).split(path.sep).join('/');
  const target = sharedModules[relative];
  return target ? { ...resolution, filePath: path.join(root, target) } : resolution;
}
module.exports = { sharedModules, edgeOneSharedModule };
