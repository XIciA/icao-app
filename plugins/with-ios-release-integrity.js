const { withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const PHASE_NAME = '[Read You 5] Enforce Release Info.plist';
const INFO_PLIST_INPUT = '"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function applyCanonicalIosUrlScheme(infoPlist, scheme) {
  if (typeof scheme !== 'string' || !scheme) {
    throw new Error('iOS Release integrity requires one canonical URL scheme.');
  }
  return {
    ...infoPlist,
    CFBundleURLTypes: [{ CFBundleURLSchemes: [scheme] }],
  };
}

function createShellScript({ version, buildNumber }) {
  return `set -eu

case "$CONFIGURATION" in
  Release*) ;;
  *) exit 0 ;;
esac

PLIST_PATH="$TARGET_BUILD_DIR/$INFOPLIST_PATH"
EXPECTED_VERSION=${shellQuote(version)}
EXPECTED_BUILD_NUMBER=${shellQuote(buildNumber)}

if [ ! -f "$PLIST_PATH" ]; then
  echo "error: Processed Release Info.plist is missing: $PLIST_PATH" >&2
  exit 1
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $EXPECTED_VERSION" "$PLIST_PATH"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $EXPECTED_BUILD_NUMBER" "$PLIST_PATH"

if /usr/libexec/PlistBuddy -c "Print :NSBonjourServices" "$PLIST_PATH" >/dev/null 2>&1; then
  SERVICE_COUNT=$(/usr/libexec/PlistBuddy -c "Print :NSBonjourServices" "$PLIST_PATH" 2>/dev/null | grep '^    ' | wc -l | tr -d ' ')
  while [ "$SERVICE_COUNT" -gt 0 ]; do
    SERVICE_INDEX=$((SERVICE_COUNT - 1))
    SERVICE=$(/usr/libexec/PlistBuddy -c "Print :NSBonjourServices:$SERVICE_INDEX" "$PLIST_PATH" 2>/dev/null || true)
    if [ "$SERVICE" = "_expo._tcp" ]; then
      /usr/libexec/PlistBuddy -c "Delete :NSBonjourServices:$SERVICE_INDEX" "$PLIST_PATH"
    fi
    SERVICE_COUNT=$SERVICE_INDEX
  done

  REMAINING_SERVICES=$(/usr/libexec/PlistBuddy -c "Print :NSBonjourServices" "$PLIST_PATH" 2>/dev/null | grep '^    ' | wc -l | tr -d ' ')
  if [ "$REMAINING_SERVICES" -eq 0 ]; then
    /usr/libexec/PlistBuddy -c "Delete :NSBonjourServices" "$PLIST_PATH"
  fi
fi

LOCAL_NETWORK_DESCRIPTION=$(/usr/libexec/PlistBuddy -c "Print :NSLocalNetworkUsageDescription" "$PLIST_PATH" 2>/dev/null || true)
case "$LOCAL_NETWORK_DESCRIPTION" in
  *"Expo Dev Launcher"*)
    /usr/libexec/PlistBuddy -c "Delete :NSLocalNetworkUsageDescription" "$PLIST_PATH"
    ;;
esac

ACTUAL_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$PLIST_PATH")
ACTUAL_BUILD_NUMBER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$PLIST_PATH")
if [ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ] || [ "$ACTUAL_BUILD_NUMBER" != "$EXPECTED_BUILD_NUMBER" ]; then
  echo "error: Release version metadata does not match app.json." >&2
  exit 1
fi
if /usr/libexec/PlistBuddy -c "Print :NSBonjourServices" "$PLIST_PATH" 2>/dev/null | grep -Fq '_expo._tcp'; then
  echo "error: Expo Dev Launcher Bonjour service leaked into the Release app." >&2
  exit 1
fi
if /usr/libexec/PlistBuddy -c "Print :NSLocalNetworkUsageDescription" "$PLIST_PATH" 2>/dev/null | grep -Fq 'Expo Dev Launcher'; then
  echo "error: Expo Dev Launcher local-network disclosure leaked into the Release app." >&2
  exit 1
fi
`;
}

function unquote(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
}

function applyReleaseIntegrity(project, options) {
  const target = project.getFirstTarget();
  const section = project.hash.project.objects.PBXShellScriptBuildPhase || {};
  const matchingIds = Object.entries(section)
    .filter(([key, value]) => !key.endsWith('_comment') && unquote(value?.name) === PHASE_NAME)
    .map(([key]) => key);

  let phaseId = matchingIds[0];
  if (!phaseId) {
    const added = project.addBuildPhase([], 'PBXShellScriptBuildPhase', PHASE_NAME, target.uuid, {
      inputPaths: [INFO_PLIST_INPUT],
      outputPaths: [],
      shellPath: '/bin/sh',
      shellScript: createShellScript(options),
    });
    phaseId = added.uuid;
  }

  const phase = section[phaseId] || project.hash.project.objects.PBXShellScriptBuildPhase[phaseId];
  phase.inputPaths = [INFO_PLIST_INPUT];
  phase.outputPaths = [];
  phase.shellPath = '/bin/sh';
  phase.shellScript = `"${createShellScript(options).replace(/"/g, '\\"')}"`;
  phase.alwaysOutOfDate = 1;
  phase.showEnvVarsInLog = 0;

  for (const duplicateId of matchingIds.slice(1)) {
    delete section[duplicateId];
    delete section[`${duplicateId}_comment`];
  }

  target.firstTarget.buildPhases = target.firstTarget.buildPhases.filter(
    ({ value }) => value !== phaseId && !matchingIds.slice(1).includes(value),
  );
  target.firstTarget.buildPhases.push({ value: phaseId, comment: PHASE_NAME });
  return project;
}

module.exports = function withIosReleaseIntegrity(config) {
  const version = config.version;
  const buildNumber = config.ios?.buildNumber;
  const scheme = config.scheme;
  if (!version || !buildNumber || typeof scheme !== 'string' || !scheme) {
    throw new Error('iOS Release integrity requires expo.version, expo.ios.buildNumber, and one URL scheme.');
  }

  if (scheme === 'readyoufife') {
    config = withInfoPlist(config, (infoPlistConfig) => {
      infoPlistConfig.modResults = applyCanonicalIosUrlScheme(infoPlistConfig.modResults, scheme);
      return infoPlistConfig;
    });
  }

  return withXcodeProject(config, (xcodeConfig) => {
    xcodeConfig.modResults = applyReleaseIntegrity(xcodeConfig.modResults, { version, buildNumber });
    return xcodeConfig;
  });
};

module.exports.applyCanonicalIosUrlScheme = applyCanonicalIosUrlScheme;
module.exports.applyReleaseIntegrity = applyReleaseIntegrity;
module.exports.createShellScript = createShellScript;
module.exports.INFO_PLIST_INPUT = INFO_PLIST_INPUT;
module.exports.PHASE_NAME = PHASE_NAME;
