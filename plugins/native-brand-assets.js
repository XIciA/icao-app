const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { IOSConfig, withBaseMod } = require('expo/config-plugins');
const fromExpo = createRequire(require.resolve('expo/package.json'));
const { generateImageAsync } = fromExpo('@expo/image-utils');
const fromImageUtils = createRequire(fromExpo.resolve('@expo/image-utils'));
const Jimp = fromImageUtils('jimp-compact');
const { setIconAsync } = fromExpo('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');
const { setSplashImageDrawablesAsync } = fromExpo('@expo/prebuild-config/build/plugins/unversioned/expo-splash-screen/withAndroidSplashImages');

const MASTER = 'assets/images/icon-native.png';
const APPROVED_SHA256 = '2e9401acce52ec48e675ca2d8df1e1659266cd0ad95698033880c5542967577b';

// The launcher applies its own mask. Launch-screen image views do not: apply the
// same rounded treatment as our in-App logo, without changing the approved artwork.
async function roundedSplash(source) {
  const image = await Jimp.read(source);
  const { width, height, data } = image.bitmap;
  const radius = width * 0.22;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = Math.max(radius - (x + 0.5), (x + 0.5) - (width - radius), 0);
      const dy = Math.max(radius - (y + 0.5), (y + 0.5) - (height - radius), 0);
      const coverage = Math.max(0, Math.min(1, radius + 0.5 - Math.hypot(dx, dy)));
      data[(y * width + x) * 4 + 3] = Math.round(255 * coverage);
    }
  }
  return image.getBufferAsync(Jimp.MIME_PNG);
}

async function assertApprovedMaster(projectRoot) {
  const source = await fs.readFile(path.join(projectRoot, MASTER));
  if (createHash('sha256').update(source).digest('hex') !== APPROVED_SHA256) {
    throw new Error('Native brand source differs from the user-approved master.');
  }
}

async function iosBrandProducts(projectRoot) {
  await assertApprovedMaster(projectRoot);
  const artifacts = [
    { role: 'app-icon', directorySuffix: 'AppIcon.appiconset', file: 'App-Icon-1024x1024@1x.png', width: 1024, opaque: true },
    ...[1, 2, 3].map((scale) => ({ role: `splash-${scale}x`, directorySuffix: 'SplashScreenLogo.imageset',
      file: scale === 1 ? 'image.png' : `image@${scale}x.png`, width: 160 * scale, opaque: false })),
  ];
  return Promise.all(artifacts.map(async (artifact) => {
    const { source } = await generateImageAsync({ projectRoot, cacheType: 'approved-native-brand' }, {
      src: path.join(projectRoot, MASTER), width: artifact.width, height: artifact.width,
      ...(artifact.opaque ? { removeTransparency: true, resizeMode: 'cover', backgroundColor: '#ffffff' } : {}),
    });
    return { ...artifact, source: artifact.opaque ? source : await roundedSplash(source) };
  }));
}

/** Native prebuild products only: the frozen Web config and its icon remain unchanged. */
function withNativeBrandAssets(config, platform) {
  return withBaseMod(config, {
    platform, mod: 'dangerous',
    async action({ modRequest: { nextMod, ...modRequest }, ...input }) {
      const result = await nextMod({ ...input, modRequest });
      const projectRoot = modRequest.projectRoot;
      await assertApprovedMaster(projectRoot);
      if (platform === 'ios') {
        const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);
        for (const artifact of await iosBrandProducts(projectRoot)) {
          const directory = path.join(sourceRoot, 'Images.xcassets', artifact.directorySuffix);
          await fs.mkdir(directory, { recursive: true });
          await fs.writeFile(path.join(directory, artifact.file), artifact.source);
        }
      } else {
        // Expo's non-adaptive fallback lets launchers inset the complete square instead of cropping the brand.
        await setIconAsync(projectRoot, { icon: path.join(projectRoot, MASTER), isAdaptive: false });
        await setSplashImageDrawablesAsync(result,
          { image: path.join(projectRoot, MASTER), backgroundColor: '#FFFFFF', resizeMode: 'contain', imageWidth: 120 },
          projectRoot, 120);
      }
      return result;
    },
  });
}

module.exports = { APPROVED_SHA256, MASTER, assertApprovedMaster, iosBrandProducts, withNativeBrandAssets };
