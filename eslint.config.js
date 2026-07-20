// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "services/**", "packages/**", "infra/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "expo-audio",
          importNames: ["setAudioModeAsync"],
          message: "Global audio mode belongs to AudioSessionOrchestrator.",
        }, {
          name: "expo-audio",
          importNames: [
            "getRecordingPermissionsAsync",
            "RecordingPresets",
            "requestRecordingPermissionsAsync",
            "useAudioRecorder",
            "useAudioRecorderState",
          ],
          message: "Recording native APIs belong to the Expo recorder adapter.",
        }],
      }],
    },
  },
  {
    files: [
      "src/platform/audio/audio-session-orchestrator.ts",
      "src/features/question-bank/recording/expo-recorder-adapter.ts",
      "src/features/question-bank/recording/expo-recorder-adapter.web.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
]);
