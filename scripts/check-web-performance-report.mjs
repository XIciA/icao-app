import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const reportPath = resolve(process.argv[2] ?? process.env.ICAO_WEB_PERFORMANCE_REPORT ?? joinGeneratedReport());
const report = JSON.parse(await readFile(reportPath, 'utf8'));

const expectedBrowsers = [
  'iphone-safari',
  'android-chrome',
  'macos-safari',
  'macos-chrome',
  'wechat-ios',
  'wechat-android',
];
const expectedNetworks = ['mainland-broadband', 'weak-1.6mbps-rtt150ms'];
const metricThresholds = {
  shellVisibleMs: { median: 1.05, p90: 1.05 },
  appReadyMs: { median: 1.03, p90: 1.05 },
  bankReadyMs: { median: 1.05, p90: 1.05 },
  questionReadyMs: { median: 1.05, p90: 1.05 },
  currentAudioFirstFrameMs: { median: 1.05, p90: 1.05 },
  nextAudioFirstFrameMs: { median: 1.05, p90: 1.05 },
  journeyExcludingWaitMs: { median: 1.05, p90: 1.05 },
};
const requiredFunctionalChecks = [
  'bootShellDismissed',
  'currentAudioPlayed',
  'deepLinkRestored',
  'favoritePersisted',
  'firstQuestionOpened',
  'learningProgressPersisted',
  'localCacheRestored',
  'loginCompleted',
  'nextAudioPlayed',
  'refreshRestored',
];

function joinGeneratedReport() {
  return `${root}/.generated/web-performance-report.json`;
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function sorted(values) {
  return [...values].sort((left, right) => left - right);
}

function median(values) {
  const valuesSorted = sorted(values);
  const middle = Math.floor(valuesSorted.length / 2);
  return valuesSorted.length % 2 === 0
    ? (valuesSorted[middle - 1] + valuesSorted[middle]) / 2
    : valuesSorted[middle];
}

function p90(values) {
  const valuesSorted = sorted(values);
  return valuesSorted[Math.ceil(valuesSorted.length * 0.9) - 1];
}

function validRuns(cell, variant) {
  const allRuns = cell.runs?.[variant] ?? [];
  for (const [index, run] of allRuns.entries()) {
    assert(run.coldStart === true, `web_performance_not_cold_start:${cell.browser}:${cell.network}:${variant}:${index}`);
    assert(
      Number.isInteger(run.sequenceIndex) && run.sequenceIndex >= 0,
      `web_performance_sequence_invalid:${cell.browser}:${cell.network}:${variant}:${index}`,
    );
    assert(
      !Array.isArray(run.failureCodes) || run.failureCodes.length === 0,
      `web_performance_functional_failure:${cell.browser}:${cell.network}:${variant}:${index}:${run.failureCodes?.join(',')}`,
    );
  }
  const runs = allRuns.filter((run) => !run.externalInvalidReason);
  assert(runs.length >= 10, `web_performance_runs_insufficient:${cell.browser}:${cell.network}:${variant}:${runs.length}`);
  for (const [index, run] of runs.entries()) {
    for (const metric of Object.keys(metricThresholds)) {
      assert(
        Number.isFinite(run[metric]) && run[metric] >= 0,
        `web_performance_metric_invalid:${cell.browser}:${cell.network}:${variant}:${index}:${metric}`,
      );
    }
    assert(
      Number.isFinite(run.shellPointerBlockedAfterAppReadyMs)
        && run.shellPointerBlockedAfterAppReadyMs <= 250,
      `web_performance_shell_blocked:${cell.browser}:${cell.network}:${variant}:${index}`,
    );
    assert(
      Number.isFinite(run.shellRemovedAfterAppReadyMs)
        && run.shellRemovedAfterAppReadyMs <= 500,
      `web_performance_shell_not_removed:${cell.browser}:${cell.network}:${variant}:${index}`,
    );
  }
  return runs;
}

function validateAlternatingRunOrder(cell) {
  const attempts = ['production', 'preview'].flatMap((variant) => (
    (cell.runs?.[variant] ?? []).map((run) => ({ sequenceIndex: run.sequenceIndex, variant }))
  )).sort((left, right) => left.sequenceIndex - right.sequenceIndex);
  assert(attempts.length >= 20, `web_performance_attempts_insufficient:${cell.browser}:${cell.network}:${attempts.length}`);
  for (const [index, attempt] of attempts.entries()) {
    assert(
      attempt.sequenceIndex === index,
      `web_performance_sequence_gap:${cell.browser}:${cell.network}:${attempt.sequenceIndex}:${index}`,
    );
    assert(
      attempt.variant === (index % 2 === 0 ? 'production' : 'preview'),
      `web_performance_not_alternating:${cell.browser}:${cell.network}:${index}:${attempt.variant}`,
    );
  }
}

function validateFunctionalChecks(cell, variant) {
  const checks = cell.functionalChecks?.[variant];
  assert(checks && typeof checks === 'object', `web_performance_functional_checks_missing:${cell.browser}:${cell.network}:${variant}`);
  for (const name of requiredFunctionalChecks) {
    assert(
      checks[name]?.passed === true && typeof checks[name]?.evidence === 'string' && checks[name].evidence.trim(),
      `web_performance_functional_check_failed:${cell.browser}:${cell.network}:${variant}:${name}`,
    );
  }
}

assert(report.schemaVersion === 1, 'web_performance_schema_invalid');
for (const key of ['deploymentId', 'gitSha', 'contentReleaseChecksum', 'audioManifestChecksum']) {
  assert(typeof report.production?.[key] === 'string' && report.production[key], `web_performance_production_${key}_missing`);
  assert(typeof report.preview?.[key] === 'string' && report.preview[key], `web_performance_preview_${key}_missing`);
}
assert(
  report.production.contentReleaseChecksum === report.preview.contentReleaseChecksum,
  'web_performance_content_release_mismatch',
);
assert(
  report.production.audioManifestChecksum === report.preview.audioManifestChecksum,
  'web_performance_audio_manifest_mismatch',
);
assert(report.production.deploymentId !== report.preview.deploymentId, 'web_performance_deployment_ids_equal');
assert(report.production.gitSha !== report.preview.gitSha, 'web_performance_git_shas_equal');

const cells = Array.isArray(report.cells) ? report.cells : [];
const summaries = [];
for (const browser of expectedBrowsers) {
  for (const network of expectedNetworks) {
    const matchingCells = cells.filter((candidate) => candidate.browser === browser && candidate.network === network);
    assert(matchingCells.length === 1, `web_performance_cell_count_invalid:${browser}:${network}:${matchingCells.length}`);
    const [cell] = matchingCells;
    assert(cell, `web_performance_cell_missing:${browser}:${network}`);
    validateAlternatingRunOrder(cell);
    validateFunctionalChecks(cell, 'production');
    validateFunctionalChecks(cell, 'preview');
    const productionRuns = validRuns(cell, 'production');
    const previewRuns = validRuns(cell, 'preview');
    const metrics = {};
    for (const [metric, thresholds] of Object.entries(metricThresholds)) {
      const productionValues = productionRuns.map((run) => run[metric]);
      const previewValues = previewRuns.map((run) => run[metric]);
      const productionMedian = median(productionValues);
      const previewMedian = median(previewValues);
      const productionP90 = p90(productionValues);
      const previewP90 = p90(previewValues);
      const medianRatio = productionMedian === 0 ? (previewMedian === 0 ? 1 : Infinity) : previewMedian / productionMedian;
      const p90Ratio = productionP90 === 0 ? (previewP90 === 0 ? 1 : Infinity) : previewP90 / productionP90;
      assert(
        medianRatio <= thresholds.median,
        `web_performance_median_regression:${browser}:${network}:${metric}:${medianRatio.toFixed(4)}`,
      );
      assert(
        p90Ratio <= thresholds.p90,
        `web_performance_p90_regression:${browser}:${network}:${metric}:${p90Ratio.toFixed(4)}`,
      );
      metrics[metric] = {
        productionMedian,
        previewMedian,
        medianRatio,
        productionP90,
        previewP90,
        p90Ratio,
      };
    }
    summaries.push({ browser, network, metrics });
  }
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  productionDeploymentId: report.production.deploymentId,
  previewDeploymentId: report.preview.deploymentId,
  cells: summaries,
}, null, 2)}\n`);
