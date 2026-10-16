// Historical pre-fix diagnostic only. Some generic files now intentionally serve the frozen legacy Web.
// Do not use this harness as acceptance for Native/EdgeOne repairs; use the committed regression tests.
// Diagnostic probes for the audit, not production tests or fixes.
// Loads current TypeScript functions with in-memory dependencies. No network or storage writes.
// Run from the repository root: node docs/workstreams/app-bug-audit/evidence/reproduce-readonly.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../../..');
function load(relative, mocks) {
  const filename = path.join(root, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, Date, Promise, Error, Set, Map, process: { env: {} },
    require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error(`Unexpected dependency: ${name}`); },
  }, { filename });
  return module.exports;
}
async function main() {
  const banks = JSON.parse(fs.readFileSync(path.join(root, 'src/features/question-bank/data/question-bank-public.json'), 'utf8'));
  const index = load('src/features/question-bank/annotations/card-index.ts', {
    '../data/repository': { getEmbeddedQuestionBanks: () => banks },
  });
  let known = 0; let found = 0;
  for (const b of banks) for (const c of b.categories) for (const t of c.topics) for (const id of t.scopeCardIds.all) {
    known++;
    if (index.getQuestionBankCardReference({ bankId: b.id, categoryId: c.id, topicId: t.id, cardId: id })) found++;
  }
  assert(known > found);
  console.log(JSON.stringify({ probe: 'A-002', directoryIds: known, staticIndexHits: found, missing: known - found }));

  // Minimal hook lifecycle harness: executes the actual hook's effect and state setters.
  // It is not a device renderer; this proves rejection handling/state transition only.
  const states = []; const effects = [];
  const react = {
    useState(value) { const i = states.length; states.push(typeof value === 'function' ? value() : value); return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
    useEffect(effect) { effects.push(effect); }, useCallback(fn) { return fn; }, useMemo(fn) { return fn(); },
  };
  const empty = () => ({ schemaVersion: 1, words: {}, updatedAt: new Date(0).toISOString() });
  const vocabulary = load('src/features/vocabulary/progress-store.ts', {
    react,
    '@/features/sync/learning-sync': { enqueueVocabularyDocument: async () => {} },
    './persistence': { createEmptyVocabularyState: empty, readVocabularyState: async () => { throw new Error('injected_storage_read_failure'); }, subscribeVocabularyState: () => () => {}, writeVocabularyState: async value => value },
    './favorites': {},
  });
  const rejection = new Promise(resolve => process.once('unhandledRejection', resolve));
  vocabulary.useVocabularyState(); effects.forEach(effect => effect());
  const error = await rejection;
  assert.equal(error.message, 'injected_storage_read_failure');
  assert.equal(states[1], false);
  console.log(JSON.stringify({ probe: 'A-005', unhandledReadRejection: error.message, readyAfterRejection: states[1] }));

  const dataset = { schemaVersion: 1, books: Object.entries({ preview: 360, icao4: 372, icao5: 106 }).map(([id, count]) => ({ id, words: Array.from({ length: count }, (_, i) => ({ id: `${id}-${i}`, bookId: id, word: 'fixture', meaning: 'fixture', example: 'fixture', exampleTranslation: 'fixture' })) })) };
  let fetched = false;
  const repo = load('src/features/vocabulary/repository.ts', {
    '@/platform/storage': { getItem: async () => null, setItem: async () => { throw new Error('injected_cache_write_failure'); } },
    '@/platform/api-client': { getApiBaseUrl: () => 'https://fixture.invalid', apiFetch: async () => { fetched = true; return { ok: true, status: 200, json: async () => ({ data: { dataset } }) }; } },
  });
  await assert.rejects(repo.loadVocabulary(), /injected_cache_write_failure/);
  assert.equal(fetched, true);
  console.log(JSON.stringify({ probe: 'A-007-vocabulary', validRemoteResponse: true, outcome: 'rejected_due_to_optional_cache_write' }));

  const editorial = load('src/features/editorial/repository.native.ts', {
    '@/platform/storage': { getItem: async () => null, setItem: async () => { throw new Error('injected_cache_write_failure'); } },
    '@/platform/api-client': { getApiBaseUrl: () => 'https://fixture.invalid', apiFetch: async () => ({ ok: true, status: 200, json: async () => ({ data: { version: 1, checksum: 'a'.repeat(64), items: [{ slug: 'fixture' }] } }) }) },
  });
  await assert.rejects(editorial.loadResourceEditorial(), /injected_cache_write_failure/);
  console.log(JSON.stringify({ probe: 'A-007-editorial', validRemoteResponse: true, outcome: 'rejected_due_to_optional_cache_write' }));

  const uiStates = [];
  const uiReact = { ...react, useEffect() {}, useState(value) {
    const i = uiStates.length;
    uiStates.push(i === 1 ? { dataset } : i === 3 ? 'testRun' : typeof value === 'function' ? value() : value);
    return [uiStates[i], next => { uiStates[i] = typeof next === 'function' ? next(uiStates[i]) : next; }];
  } };
  const screen = load('src/features/vocabulary/VocabularyScreen.tsx', {
    react: uiReact,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/components/ui/icons': {}, '@/components/navigation/TopBar': {}, '@/components/states/CenteredState': {}, '@/components/ui': {},
    './components/VocabularyLibraryViews': {}, './components/VocabularyStudyViews': {},
    './components/VocabularyTestViews': { VocabularyTestRunner: 'runner' },
    './repository': {},
    './progress-store': { useVocabularyProgress: () => ({ ready: true, state: empty(), saveTestResult: async () => { throw new Error('injected_result_save_failure'); } }) },
  });
  const runner = screen.VocabularyScreen();
  assert.equal(runner.type, 'runner');
  const saveRejection = new Promise(resolve => process.once('unhandledRejection', resolve));
  runner.props.onFinish({ schemaVersion: 1, total: 1, answers: [], completedAt: new Date(0).toISOString() });
  assert.equal((await saveRejection).message, 'injected_result_save_failure');
  assert.equal(uiStates[3], 'testResult');
  console.log(JSON.stringify({ probe: 'A-006', saveRejected: true, viewAfterRejection: uiStates[3], handledByScreen: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
