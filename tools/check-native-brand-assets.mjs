#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inflateSync } from 'node:zlib';

import ts from 'typescript';

const repositoryRoot = process.cwd();
const manifestPath = path.join(repositoryRoot, 'assets/native-brand-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_COLOR_TYPES = {
  2: { channels: 3, hasAlpha: false, name: 'rgb' },
  6: { channels: 4, hasAlpha: true, name: 'rgba' },
};

function fail(message) {
  throw new Error(message);
}

function repositoryPath(absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isBrandAssetCandidate(file) {
  const candidateRoots = manifest.inventory.candidateRoots.map((root) => `${root}/`);
  if (!candidateRoots.some((root) => file.startsWith(root))) return false;
  const segments = file.split('/');
  const basename = segments.at(-1) ?? '';
  const isImage = /\.(?:jpe?g|png|webp|svg)$/iu.test(basename);
  const isBrandControlFile = /\.(?:json|xml|storyboard)$/iu.test(basename);
  const brandTerms = /(?:brand|branding|favicon|icon|logo|mark|splash|symbol|wordmark|emblem|badge|identity)/iu;
  const isGenericBrandImageName = /^(?:app|asset|image|master|product)(?:[-_.][a-z0-9]+)*\.(?:jpe?g|png|webp|svg)$/iu.test(basename);
  const genericImageRoot = file.startsWith('assets/images/') || file.startsWith('src/');
  return (isImage && (genericImageRoot || isGenericBrandImageName))
    || ((isImage || isBrandControlFile) && (
      brandTerms.test(basename)
      || segments.some((segment) => brandTerms.test(segment))
    ));
}

function parsePng(buffer, fileLabel) {
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail(`${fileLabel} is not a PNG file.`);
  }

  let offset = PNG_SIGNATURE.length;
  let header;
  const compressed = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) fail(`${fileLabel} contains a truncated ${type} chunk.`);
    if (type === 'IHDR') {
      header = {
        width: buffer.readUInt32BE(start),
        height: buffer.readUInt32BE(start + 4),
        bitDepth: buffer[start + 8],
        colorTypeCode: buffer[start + 9],
        compression: buffer[start + 10],
        filter: buffer[start + 11],
        interlace: buffer[start + 12],
      };
    } else if (type === 'IDAT') {
      compressed.push(buffer.subarray(start, end));
    } else if (type === 'IEND') {
      break;
    }
    offset = end + 4;
  }

  if (!header) fail(`${fileLabel} has no IHDR chunk.`);
  const color = PNG_COLOR_TYPES[header.colorTypeCode];
  if (!color || header.bitDepth !== 8 || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    fail(`${fileLabel} must be a non-interlaced 8-bit RGB or RGBA PNG.`);
  }
  if (compressed.length === 0) fail(`${fileLabel} has no image data.`);

  const rowBytes = header.width * color.channels;
  const inflated = inflateSync(Buffer.concat(compressed));
  if (inflated.length !== header.height * (rowBytes + 1)) {
    fail(`${fileLabel} has an unexpected decoded byte length.`);
  }

  const pixels = Buffer.alloc(header.height * rowBytes);
  let inputOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= color.channels ? pixels[rowOffset + x - color.channels] : 0;
      const above = y > 0 ? pixels[rowOffset + x - rowBytes] : 0;
      const upperLeft = y > 0 && x >= color.channels ? pixels[rowOffset + x - rowBytes - color.channels] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else if (filter === 4) value = raw + paeth(left, above, upperLeft);
      else fail(`${fileLabel} uses unsupported PNG filter ${filter}.`);
      pixels[rowOffset + x] = value & 0xff;
    }
    inputOffset += rowBytes;
  }

  return {
    ...header,
    channels: color.channels,
    colorType: color.name,
    hasAlpha: color.hasAlpha,
    pixels,
  };
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function contentBounds(png, backgroundRgb, tolerance) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const pixelOffset = (y * png.width + x) * png.channels;
      const differs = backgroundRgb.some(
        (channel, index) => Math.abs(png.pixels[pixelOffset + index] - channel) > tolerance,
      );
      if (!differs) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) fail('The brand master contains no visible content.');
  return { minX, minY, maxX, maxY };
}

function clearEdgeFractions(png, bounds) {
  return {
    left: bounds.minX / png.width,
    top: bounds.minY / png.height,
    right: (png.width - bounds.maxX - 1) / png.width,
    bottom: (png.height - bounds.maxY - 1) / png.height,
  };
}

function validateClearEdges(png, minimum, label) {
  const safe = manifest.cng.splash.safeArea;
  const bounds = contentBounds(png, safe.backgroundRgb, safe.backgroundTolerance);
  const fractions = clearEdgeFractions(png, bounds);
  for (const [edge, fraction] of Object.entries(fractions)) {
    if (fraction < minimum) fail(`${label} ${edge} clear edge is too small: ${(fraction * 100).toFixed(2)}%.`);
  }
  return fractions;
}

function validateOpaque(png, label, minimumAlpha = 255) {
  if (!png.hasAlpha) return;
  for (let offset = png.channels - 1; offset < png.pixels.length; offset += png.channels) {
    if (png.pixels[offset] < minimumAlpha) fail(`${label} unexpectedly contains transparent pixels.`);
  }
}

function validateFullBleed(png, label) {
  validateOpaque(png, label);
  const edgePixels = [];
  for (let x = 0; x < png.width; x += 1) edgePixels.push(x, (png.height - 1) * png.width + x);
  for (let y = 1; y < png.height - 1; y += 1) edgePixels.push(y * png.width, (y + 1) * png.width - 1);
  for (const pixel of edgePixels) {
    const offset = pixel * png.channels;
    const [r, g, b] = png.pixels.subarray(offset, offset + 3);
    if (b < r + 12 || b < g) fail(`${label} must retain the approved blue full-bleed edges, without a white frame.`);
  }
}

function validateRoundedSplash(png, label) {
  if (!png.hasAlpha) fail(`${label} must include a rounded transparent mask.`);
  const alphaAt = (x, y) => png.pixels[(y * png.width + x) * png.channels + png.channels - 1];
  for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]]) {
    if (alphaAt(x, y) !== 0) fail(`${label} still has square visible corners.`);
  }
  const center = Math.floor(png.width / 2);
  if (alphaAt(center, Math.floor(png.height * 0.3)) !== 255) fail(`${label} loses the approved logo.`);

}

function validateMaster() {
  const masterPath = path.join(repositoryRoot, manifest.master.path);
  const source = readFileSync(masterPath);
  const actualHash = sha256(source);
  if (actualHash !== manifest.master.sha256) {
    fail(`Brand master SHA-256 changed: expected ${manifest.master.sha256}, received ${actualHash}.`);
  }

  const png = parsePng(source, manifest.master.path);
  for (const key of ['width', 'height', 'bitDepth', 'colorType', 'hasAlpha']) {
    if (png[key] !== manifest.master.png[key]) {
      fail(`Brand master ${key} changed: expected ${manifest.master.png[key]}, received ${png[key]}.`);
    }
  }
  if (png.width !== png.height) fail('Brand master must remain square.');

  if (!manifest.master.fullBleed) fail('The approved Native brand master must be full bleed.');
  validateFullBleed(png, manifest.master.path);
  return { png };
}

function findSplashPlugin(appConfig) {
  return appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  )?.[1];
}

function validateCngConfig() {
  const appConfig = JSON.parse(readFileSync(path.join(repositoryRoot, manifest.cng.config), 'utf8'));
  const master = `./${manifest.cng.frozenWebIcon}`;
  for (const [label, value] of [
    ['expo.icon', appConfig.expo.icon],
    ['expo.ios.icon', appConfig.expo.ios?.icon],
    ['expo.android.icon', appConfig.expo.android?.icon],
  ]) {
    if (value !== master) fail(`${label} frozen Web fallback must reference ${master}; Native products are supplied by the CNG plugin.`);
  }
  const nativePlugin = readFileSync(path.join(repositoryRoot, manifest.cng.nativeBrandPlugin), 'utf8');
  if (!nativePlugin.includes(manifest.master.path) || !nativePlugin.includes(manifest.master.sha256)) fail('Native brand plugin is not bound to the approved master.');
  for (const [pluginPath, platform] of [['plugins/with-ios-release-integrity.js', 'ios'], ['plugins/with-android-release-signing.js', 'android']]) {
    if (!readFileSync(path.join(repositoryRoot, pluginPath), 'utf8').includes(`withNativeBrandAssets(config, '${platform}')`)) fail(`${platform} prebuild does not apply the Native brand products.`);
  }

  const splash = findSplashPlugin(appConfig);
  if (!splash) fail('expo-splash-screen must have an explicit CNG configuration.');
  if (splash.image !== master) fail(`expo-splash-screen.image must reference ${master}.`);
  if (splash.backgroundColor !== manifest.cng.splash.backgroundColor) fail('Splash background no longer matches the brand manifest.');
  if (splash.imageWidth !== manifest.cng.splash.imageWidth) fail('iOS/default splash width no longer matches the brand manifest.');
  if (splash.android?.imageWidth !== manifest.cng.splash.androidImageWidth) fail('Android splash width no longer matches the safe brand manifest value.');
  const composition = parsePng(readFileSync(path.join(repositoryRoot, manifest.cng.derivationBinding.startup.path)), 'B startup composition');
  for (let y = 0; y < composition.height; y += 1) {
    for (let x = 0; x < composition.width; x += 1) {
      if (composition.pixels[(y * composition.width + x) * composition.channels + 3] < 16) continue;
      const radius = Math.hypot(x + 0.5 - composition.width / 2, y + 0.5 - composition.height / 2)
        * splash.android.imageWidth / composition.width;
      if (radius > 96) fail('B composition exceeds the Android 12 system mask.');
    }
  }
  if (splash.resizeMode !== manifest.cng.splash.resizeMode) fail('Splash must use contain mode.');

  for (const platform of ['ios', 'android']) {
    const override = splash[platform];
    if (override?.image && override.image !== master) {
      fail(`expo-splash-screen.${platform}.image must not introduce another brand source.`);
    }
  }

  const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  if (!packageJson.dependencies?.expo?.startsWith('~55.')) fail('Brand CNG manifest requires the locked Expo 55 generator.');
  if (!packageJson.dependencies?.['expo-splash-screen']?.startsWith('~55.')) fail('Brand CNG manifest requires expo-splash-screen 55.');
  const lockfile = readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
  const versions = manifest.cng.generatorVersions;
  if (manifest.cng.derivationBinding?.masterSha256 !== manifest.master.sha256) {
    fail('CNG derivation binding is not attached to the current unique brand master.');
  }
  if (!Array.isArray(manifest.cng.derivationBinding?.ios) || manifest.cng.derivationBinding.ios.length === 0) {
    fail('CNG derivation binding must enumerate the approved generated iOS brand products.');
  }
  if (!lockfile.includes(`version: ${versions.expo}(`)) fail(`pnpm-lock.yaml does not lock Expo ${versions.expo}.`);
  if (!lockfile.includes(`version: ${versions.expoSplashScreen}(expo@${versions.expo})`)) {
    fail(`pnpm-lock.yaml does not lock expo-splash-screen ${versions.expoSplashScreen} with Expo ${versions.expo}.`);
  }
}

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : listSourceFiles(entryPath);
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/u.test(entry.name) || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name)) return [];
    if (/\.web\.[cm]?[jt]sx?$/u.test(entry.name)) return [];
    const genericMatch = entry.name.match(/^(.*)(\.[cm]?[jt]sx?)$/u);
    if (genericMatch && !/\.(?:android|ios|native)\.[cm]?[jt]sx?$/u.test(entry.name)) {
      const [, stem, extension] = genericMatch;
      const hasNativeOverride = existsSync(path.join(directory, `${stem}.native${extension}`));
      const hasPlatformOverrides = existsSync(path.join(directory, `${stem}.ios${extension}`))
        && existsSync(path.join(directory, `${stem}.android${extension}`));
      if (hasNativeOverride || hasPlatformOverrides) return [];
    }
    return [entryPath];
  });
}

function sourceLocation(sourceFile, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${repositoryPath(sourceFile.fileName)}:${line + 1}`;
}

function tagName(node) {
  const tag = ts.isJsxSelfClosingElement(node) ? node.tagName : node.openingElement.tagName;
  return ts.isIdentifier(tag) ? tag.text : tag.getText();
}

function conditionIsWebOnly(condition, trueBranch) {
  const normalized = condition.getText().replace(/\s+/gu, '');
  const equalsWeb = normalized === "Platform.OS==='web'" || normalized === "Platform.OS===\"web\"" || normalized === "'web'===Platform.OS" || normalized === '"web"===Platform.OS';
  const differsWeb = normalized === "Platform.OS!=='web'" || normalized === "Platform.OS!==\"web\"" || normalized === "'web'!==Platform.OS" || normalized === '"web"!==Platform.OS';
  return trueBranch ? equalsWeb : differsWeb;
}

function isInside(node, branch) {
  return node.pos >= branch.pos && node.end <= branch.end;
}

function isWebOnly(node) {
  let current = node.parent;
  while (current) {
    if (ts.isConditionalExpression(current)) {
      if (isInside(node, current.whenTrue) && conditionIsWebOnly(current.condition, true)) return true;
      if (isInside(node, current.whenFalse) && conditionIsWebOnly(current.condition, false)) return true;
    }
    current = current.parent;
  }
  return false;
}

function looksLikeBrandImpersonation(node, sourceFile) {
  const ownText = node.getText(sourceFile);
  if (/rotate|brand|logo|mark/iu.test(ownText)) return true;
  let current = node.parent;
  let depth = 0;
  while (current && depth < 4) {
    if ((ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) && /styles\.(?:brand|logo|mark)/iu.test(current.getText(sourceFile))) {
      return true;
    }
    current = current.parent;
    depth += 1;
  }
  return false;
}

function brandImpersonationViolations(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const importedNames = new Map();
  const violations = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.getText(sourceFile).replace(/['"]/gu, '') !== '@/components/ui/icons') continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      importedNames.set(element.name.text, (element.propertyName ?? element.name).text);
    }
  }

  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const imported = importedNames.get(tagName(node));
      if ((imported === 'Plane' || imported === 'Upload') && looksLikeBrandImpersonation(node, sourceFile) && !isWebOnly(node)) {
        violations.push(`${sourceLocation(sourceFile, node)} uses Lucide ${imported} as a Native brand mark`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

function validateRuntimeBoundary() {
  const violations = [];
  const componentPath = path.join(repositoryRoot, manifest.runtime.component);
  const sourceFiles = listSourceFiles(path.join(repositoryRoot, 'src'));
  const brandAssetPattern = /assets\/images\/[A-Za-z0-9._/-]*(?:brand|favicon|icon|logo|mark|splash|symbol|wordmark|emblem)[A-Za-z0-9._/-]*/giu;

  for (const filePath of sourceFiles) {
    const source = readFileSync(filePath, 'utf8');
    const assetReferences = source.match(brandAssetPattern) ?? [];
    for (const reference of assetReferences) {
      const normalized = reference.replace(/^\.\.\//u, '');
      const centralizedMaster = filePath === componentPath && reference === manifest.master.path;
      const startupComposition = repositoryPath(filePath) === 'src/components/states/StartupBrandScreen.tsx' && reference === manifest.cng.derivationBinding.startup.path;
      if (!centralizedMaster && !startupComposition) {
        violations.push(`${repositoryPath(filePath)} directly references Native brand asset ${normalized}`);
      }
    }
    violations.push(...brandImpersonationViolations(source, filePath));
  }

  const component = readFileSync(componentPath, 'utf8');
  for (const required of ['APP_BRAND_LOGO_SOURCE', 'resizeMode="contain"', 'APP_BRAND_LOGO_SIZES', 'accessibilityRole']) {
    if (!component.includes(required)) violations.push(`${manifest.runtime.component} is missing ${required}`);
  }

  for (const surface of manifest.runtime.surfaces) {
    const source = readFileSync(path.join(repositoryRoot, surface), 'utf8');
    if (!source.includes('AppBrandLogo')) violations.push(`${surface} must render AppBrandLogo.`);
  }

  const startup = manifest.cng.derivationBinding.startup;
  if (sha256(readFileSync(path.join(repositoryRoot, startup.path))) !== startup.sha256) {
    violations.push('Startup composition differs from the reviewed B asset.');
  }
  const loadingSource = readFileSync(path.join(repositoryRoot, 'src/components/states/GlobalLoadingScreen.native.tsx'), 'utf8');
  if (loadingSource.includes('AppBrandLogo') || !loadingSource.includes('<ActivityIndicator')) violations.push('In-app data loading must remain lightweight.');
  const layoutSource = readFileSync(path.join(repositoryRoot, 'src/app/_layout.native.tsx'), 'utf8');
  if (!layoutSource.includes('<StartupBrandScreen />') || layoutSource.includes('<GlobalLoadingScreen />')) violations.push('Startup must reuse the B surface throughout readiness.');

  if (violations.length > 0) fail(['Native brand boundary failed:', ...violations.map((value) => `- ${value}`)].join('\n'));
}

function validateAssetInventory() {
  for (const retired of manifest.retiredNativeAssets) {
    if (existsSync(path.join(repositoryRoot, retired))) fail(`Retired Native brand asset still exists: ${retired}`);
  }
  for (const external of manifest.frozenExternalAssets) {
    if (!existsSync(path.join(repositoryRoot, external.path))) fail(`Classified frozen external asset is missing: ${external.path}`);
  }
  const nativeTreePolicy = manifest.cng.nativeTreePolicy;
  if (nativeTreePolicy.authority !== 'clean-prebuild-only') {
    fail('Native brand release authority must remain clean-prebuild-only.');
  }
  if (nativeTreePolicy.trackedDerivedAssets.length !== 0) {
    fail('CNG brand derivatives must remain generated and untracked.');
  }
  if (!nativeTreePolicy.releasePrebuildCommand.includes('--clean')) {
    fail('Native brand release prebuild must remain clean.');
  }
  if (!nativeTreePolicy.releaseVerificationCommand.includes('--platform ios')) {
    fail('Native brand release verification must explicitly validate the generated iOS assets.');
  }

  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (tracked.status !== 0) fail('Unable to inventory tracked brand asset candidates.');
  const trackedFiles = tracked.stdout.split('\0').filter(Boolean);
  const ignoredGeneratedRoots = nativeTreePolicy.ignoredGeneratedRoots.map((root) => `${root}/`);
  for (const root of nativeTreePolicy.ignoredGeneratedRoots) {
    const ignored = spawnSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', `${root}/__native_brand_probe__`],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    if (ignored.status !== 0) {
      fail(`git check-ignore does not classify the generated Native root as ignored: ${root}/`);
    }
  }
  for (const repositoryPath of trackedFiles) {
    if (ignoredGeneratedRoots.some((root) => repositoryPath.startsWith(root))) {
      fail(`Generated Native project tree must remain untracked: ${repositoryPath}`);
    }
  }

  const allowedPaths = new Set([
    manifest.master.path,
    ...manifest.inventory.nonProductControlFiles,
  ]);
  const allowedRoots = manifest.frozenExternalAssets.map((entry) => entry.path);
  const candidateFiles = new Set(trackedFiles.filter(isBrandAssetCandidate));
  for (const root of manifest.inventory.candidateRoots) {
    if (nativeTreePolicy.ignoredGeneratedRoots.includes(root)) continue;
    const absoluteRoot = path.join(repositoryRoot, root);
    for (const file of findFiles(absoluteRoot, () => true)) {
      const candidate = repositoryPath(file);
      if (isBrandAssetCandidate(candidate)) candidateFiles.add(candidate);
    }
  }
  for (const candidate of [...candidateFiles].sort()) {
    const classified = allowedPaths.has(candidate)
      || allowedRoots.some((root) => candidate === root || candidate.startsWith(`${root}/`));
    if (!classified) fail(`Unclassified competing brand asset found: ${candidate}`);
  }
}

function findDirectories(root, suffix) {
  const matches = [];
  if (!existsSync(root)) return matches;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith(suffix)) matches.push(entryPath);
    matches.push(...findDirectories(entryPath, suffix));
  }
  return matches;
}

function findFiles(root, predicate) {
  const matches = [];
  if (!existsSync(root)) return matches;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) matches.push(...findFiles(entryPath, predicate));
    else if (entry.isFile() && predicate(entryPath)) matches.push(entryPath);
  }
  return matches;
}

function requireExactlyOne(values, label) {
  if (values.length !== 1) fail(`Expected exactly one generated ${label}; found ${values.length}.`);
  return values[0];
}

function validateGeneratedIos(prebuildRoot) {
  const iosRoot = path.join(prebuildRoot, 'ios');
  const appIconSet = requireExactlyOne(findDirectories(iosRoot, 'AppIcon.appiconset'), 'iOS AppIcon set');
  const splashSet = requireExactlyOne(findDirectories(iosRoot, 'SplashScreenLogo.imageset'), 'iOS splash image set');
  const storyboards = findFiles(iosRoot, (file) => path.basename(file) === 'SplashScreen.storyboard');
  const storyboard = readFileSync(requireExactlyOne(storyboards, 'iOS SplashScreen.storyboard'), 'utf8');
  if (!storyboard.includes('SplashScreenLogo')) fail('Generated iOS LaunchScreen does not reference SplashScreenLogo.');

  const appIconContents = JSON.parse(readFileSync(path.join(appIconSet, 'Contents.json'), 'utf8'));
  const appIconFiles = [...new Set(appIconContents.images.map((image) => image.filename).filter(Boolean))];
  if (appIconFiles.length === 0) fail('Generated iOS AppIcon set has no image files.');
  const appIcons = appIconFiles.map((file) => parsePng(readFileSync(path.join(appIconSet, file)), `iOS AppIcon ${file}`));
  if (!appIcons.some((icon) => icon.width === 1024 && icon.height === 1024 && !icon.hasAlpha)) {
    fail('Generated iOS AppIcon set has no opaque 1024×1024 icon.');
  }
  for (const [index, appIcon] of appIcons.entries()) {
    validateOpaque(appIcon, `iOS AppIcon ${appIconFiles[index]}`);
    validateFullBleed(appIcon, `iOS AppIcon ${appIconFiles[index]}`);
  }

  const splashContents = JSON.parse(readFileSync(path.join(splashSet, 'Contents.json'), 'utf8'));
  const splashFiles = [...new Set(splashContents.images.map((image) => image.filename).filter(Boolean))];
  if (splashFiles.length < 3) fail('Generated iOS splash set must include 1x, 2x, and 3x images.');
  const splashImages = splashFiles.map((file) => parsePng(readFileSync(path.join(splashSet, file)), `iOS splash ${file}`));
  for (const [index, splashImage] of splashImages.entries()) {
    validateRoundedSplash(splashImage, `iOS splash ${splashFiles[index]}`);
  }
  const splashSizes = splashImages
    .map((image) => image.width)
    .sort((left, right) => left - right);
  const expected = [1, 2, 3].map((scale) => manifest.cng.splash.imageWidth * scale);
  if (expected.some((size) => !splashSizes.includes(size))) {
    fail(`Generated iOS splash widths ${splashSizes.join(', ')} do not include ${expected.join(', ')}.`);
  }

  const binding = manifest.cng.derivationBinding;
  if (binding.masterSha256 !== manifest.master.sha256) {
    fail('CNG derivation binding is not attached to the current unique brand master.');
  }
  const generatedDirectories = new Map([
    ['AppIcon.appiconset', appIconSet],
    ['SplashScreenLogo.imageset', splashSet],
  ]);
  const referencedFiles = new Map([
    ['AppIcon.appiconset', new Set(appIconFiles)],
    ['SplashScreenLogo.imageset', new Set(splashFiles)],
  ]);
  for (const artifact of binding.ios) {
    const directory = generatedDirectories.get(artifact.directorySuffix);
    if (!directory) fail(`Unknown iOS brand derivative directory: ${artifact.directorySuffix}`);
    const artifactPath = path.join(directory, artifact.file);
    if (!existsSync(artifactPath)) fail(`Expected generated ${artifact.role} is missing: ${artifact.file}`);
    if (!referencedFiles.get(artifact.directorySuffix)?.has(artifact.file)) {
      fail(`Generated ${artifact.role} is not referenced by its iOS asset catalog: ${artifact.file}`);
    }
    const source = readFileSync(artifactPath);
    const actualHash = sha256(source);
    if (actualHash !== artifact.sha256) {
      fail(`Generated ${artifact.role} is not the approved derivative of master ${binding.masterSha256}: expected ${artifact.sha256}, received ${actualHash}.`);
    }
    const png = parsePng(source, `generated ${artifact.role}`);
    for (const key of ['width', 'height', 'hasAlpha']) {
      if (png[key] !== artifact[key]) {
        fail(`Generated ${artifact.role} ${key} changed: expected ${artifact[key]}, received ${png[key]}.`);
      }
    }
    if (artifact.role === 'app-icon') validateOpaque(png, `generated ${artifact.role}`);
    else validateRoundedSplash(png, `generated ${artifact.role}`);
  }
}

function validateGeneratedAndroid(prebuildRoot) {
  const androidRoot = path.join(prebuildRoot, 'android/app/src/main/res');
  const splashFiles = findFiles(androidRoot, (file) => path.basename(file) === 'splashscreen_logo.png');
  if (splashFiles.length !== 5) fail(`Expected five Android density splash images; found ${splashFiles.length}.`);
  const splashImages = splashFiles.map((file) => parsePng(readFileSync(file), repositoryPath(file)));
  for (const [index, splashImage] of splashImages.entries()) {
    // Expo background compositing can truncate anti-aliased alpha to 254.
    // Keep icons/master strictly opaque; reject any larger loss in Android splash products.
    validateOpaque(splashImage, repositoryPath(splashFiles[index]), 254);
    validateClearEdges(splashImage, 0.18, repositoryPath(splashFiles[index]));
  }
  const splashSizes = splashImages
    .map((image) => image.width)
    .sort((left, right) => left - right);
  const expectedCanvasSizes = [288, 432, 576, 864, 1152];
  if (expectedCanvasSizes.some((size) => !splashSizes.includes(size))) {
    fail(`Generated Android splash canvases ${splashSizes.join(', ')} do not match the Expo CNG density set.`);
  }

  const launcherIcons = findFiles(androidRoot, (file) => /^ic_launcher(?:_round)?\.webp$/u.test(path.basename(file)));
  if (launcherIcons.length < 5) fail(`Expected generated Android launcher icons for five densities; found ${launcherIcons.length}.`);
  const launcherForegrounds = findFiles(androidRoot, (file) => path.basename(file) === 'ic_launcher_foreground.webp');
  if (launcherForegrounds.length < 5) fail(`Expected generated Android launcher foregrounds for five densities; found ${launcherForegrounds.length}.`);
  const styles = readFileSync(path.join(androidRoot, 'values/styles.xml'), 'utf8');
  if (!styles.includes('Theme.App.SplashScreen') || !styles.includes('@drawable/splashscreen_logo')) {
    fail('Generated Android launch theme does not reference splashscreen_logo.');
  }
  const colors = readFileSync(path.join(androidRoot, 'values/colors.xml'), 'utf8');
  if (!colors.toUpperCase().includes(manifest.cng.splash.backgroundColor)) {
    fail('Generated Android splash background does not match the brand manifest.');
  }
}

function selfTest() {
  const failure = `import { Plane } from '@/components/ui/icons';\nconst x = <View style={styles.logo}><Plane style={{ transform: [{ rotate: '-45deg' }] }} /></View>;`;
  const webOnly = `import { Upload } from '@/components/ui/icons';\nconst x = Platform.OS === 'web' ? <View style={styles.logo}><Upload style={{ transform: [{ rotate: '-45deg' }] }} /></View> : <AppBrandLogo />;`;
  const functional = `import { Upload } from '@/components/ui/icons';\nconst x = <Row icon={Upload} label="导出" />;`;
  if (brandImpersonationViolations(failure, path.join(repositoryRoot, 'fixture.tsx')).length !== 1) fail('Brand gate self-test did not reject a rotated Plane logo.');
  if (brandImpersonationViolations(webOnly, path.join(repositoryRoot, 'fixture.tsx')).length !== 0) fail('Brand gate self-test rejected an explicit Web-only legacy mark.');
  if (brandImpersonationViolations(functional, path.join(repositoryRoot, 'fixture.tsx')).length !== 0) fail('Brand gate self-test rejected a functional Upload icon.');
  for (const candidate of ['assets/images/mark.png', 'assets/images/image.png', 'src/features/account/art.png', 'public/image.png']) {
    if (!isBrandAssetCandidate(candidate)) fail(`Brand inventory self-test missed generic candidate ${candidate}.`);
  }
  if (isBrandAssetCandidate('assets/audio/mark.mp3')) fail('Brand inventory self-test classified non-image media.');
}

try {
  selfTest();
  validateMaster();
  validateCngConfig();
  validateRuntimeBoundary();
  validateAssetInventory();
  const args = process.argv.slice(2);
  let prebuildRootValue;
  let platform = 'all';
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--prebuild-root') {
      prebuildRootValue = args[index + 1];
      if (!prebuildRootValue) fail('--prebuild-root requires a directory.');
      index += 1;
      continue;
    }
    if (args[index] === '--platform') {
      platform = args[index + 1];
      if (!['ios', 'android', 'all'].includes(platform)) fail('--platform must be ios, android, or all.');
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${args[index]}`);
  }
  if (platform !== 'all' && !prebuildRootValue) fail('--platform requires --prebuild-root.');
  const prebuildFlag = args.indexOf('--prebuild-root');
  if (prebuildFlag >= 0) {
    const prebuildRoot = path.resolve(prebuildRootValue);
    if (platform === 'ios' || platform === 'all') validateGeneratedIos(prebuildRoot);
    if (platform === 'android' || platform === 'all') validateGeneratedAndroid(prebuildRoot);
    console.log(`Native brand CNG ${platform} products verified in ${prebuildRoot}.`);
  }
  console.log(`Native brand boundary OK (${manifest.master.sha256}; approved full-bleed source).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
