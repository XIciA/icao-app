const { withAppBuildGradle } = require('expo/config-plugins');
const { withNativeBrandAssets } = require('./native-brand-assets');

const ENV_BLOCK = `// ICAO_RELEASE_SIGNING_ENV_START
def icaoReleaseStorePath = System.getenv("ICAO_ANDROID_KEYSTORE_PATH")
def icaoReleaseStorePassword = System.getenv("ICAO_ANDROID_KEYSTORE_PASSWORD")
def icaoReleaseKeyAlias = System.getenv("ICAO_ANDROID_KEY_ALIAS")
def icaoReleaseKeyPassword = System.getenv("ICAO_ANDROID_KEY_PASSWORD")
def icaoReleaseSigningMissing = [
    ICAO_ANDROID_KEYSTORE_PATH: icaoReleaseStorePath,
    ICAO_ANDROID_KEYSTORE_PASSWORD: icaoReleaseStorePassword,
    ICAO_ANDROID_KEY_ALIAS: icaoReleaseKeyAlias,
    ICAO_ANDROID_KEY_PASSWORD: icaoReleaseKeyPassword,
].findAll { entry -> !entry.value }.keySet()

gradle.taskGraph.whenReady { graph ->
    def requestsRelease = graph.allTasks.any { task ->
        task.path.toLowerCase().contains("release")
    }
    if (requestsRelease && !icaoReleaseSigningMissing.isEmpty()) {
        throw new GradleException("Missing Android release signing environment: " + icaoReleaseSigningMissing.join(", "))
    }
}
// ICAO_RELEASE_SIGNING_ENV_END

`;

const RELEASE_CONFIG = `        release {
            if (icaoReleaseStorePath) {
                storeFile file(icaoReleaseStorePath)
                storePassword icaoReleaseStorePassword
                keyAlias icaoReleaseKeyAlias
                keyPassword icaoReleaseKeyPassword
                storeType "PKCS12"
            }
        }
`;

function applySigning(contents) {
  let next = contents;

  if (!next.includes('ICAO_RELEASE_SIGNING_ENV_START')) {
    const androidIndex = next.indexOf('android {');
    if (androidIndex < 0) {
      throw new Error('Unable to find the Android Gradle configuration block.');
    }
    next = `${next.slice(0, androidIndex)}${ENV_BLOCK}${next.slice(androidIndex)}`;
  }

  if (!next.includes('storeType "PKCS12"')) {
    const signingPattern = /(\n    signingConfigs \{\s*\n        debug \{[\s\S]*?\n        \}\s*\n)(    \})/;
    if (!signingPattern.test(next)) {
      throw new Error('Unable to find the generated Android debug signing block.');
    }
    next = next.replace(signingPattern, `$1${RELEASE_CONFIG}$2`);
  }

  const releasePattern = /(buildTypes \{[\s\S]*?\n        release \{[\s\S]*?)(signingConfig signingConfigs\.)debug/;
  if (!releasePattern.test(next) && !next.includes('signingConfig signingConfigs.release')) {
    throw new Error('Unable to find the generated Android release build type.');
  }
  next = next.replace(releasePattern, '$1$2release');
  return next;
}

module.exports = function withAndroidReleaseSigning(config) {
  config = withNativeBrandAssets(config, 'android');
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('Android release signing currently requires Groovy build.gradle output.');
    }
    gradleConfig.modResults.contents = applySigning(gradleConfig.modResults.contents);
    return gradleConfig;
  });
};

module.exports.applySigning = applySigning;
