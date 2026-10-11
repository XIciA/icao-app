import { act, renderHook, waitFor } from '@testing-library/react-native';
import { digestStringAsync } from 'expo-crypto';
import { useQuestionRecording } from '../use-question-recording.browser';
import recordings from '../opi-recorded-audio.json';
import source from '../../../../content/question-banks/native-audio/opi/manifest.json';
import supplemental from '../../../../content/question-banks/web-audio/opi/manifest.json';

// Jest runs this verification against the real source manifest in Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash } = require('node:crypto');

const mockAsset = jest.fn((path?: string) => ({ uri: path ? 'https://private.test/signed.mp3' : undefined, resolving: false, retry: jest.fn() }));
jest.mock('@/features/question-bank/hooks/useQuestionBankAsset', () => ({ useQuestionBankAsset: (path?: string) => mockAsset(path) }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: jest.fn() }));
const text = 'Have you ever encountered a lightning strike during flight?';
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(digestStringAsync).mockImplementation(async (_algorithm, value) => createHash('sha256').update(value).digest('hex'));
});

it('resolves the existing private recording only when the question text still matches', async () => {
  const hook = await renderHook(() => useQuestionRecording('opi-core-001', text));
  await waitFor(() => expect(hook.result.current.uri).toBe('https://private.test/signed.mp3'));
  expect(mockAsset).toHaveBeenLastCalledWith(recordings.records['opi-core-001'].path);
});
it('never plays an outdated recording for changed question text', async () => {
  const hook = await renderHook(() => useQuestionRecording('opi-core-001', 'Changed question?'));
  await waitFor(() => expect(hook.result.current.resolving).toBe(false));
  expect(hook.result.current.uri).toBeUndefined();
  expect(mockAsset.mock.calls.every(([path]) => path === undefined)).toBe(true);
});
it('does not request a recording for unknown or absent question IDs', async () => {
  const hook = await renderHook(() => useQuestionRecording('new-question', text));
  expect(hook.result.current.resolving).toBe(false);
  expect(hook.result.current.uri).toBeUndefined();
  expect(digestStringAsync).not.toHaveBeenCalled();
});
it('ignores a stale hash result after changing questions', async () => {
  let resolve!: (value: string) => void;
  jest.mocked(digestStringAsync).mockReturnValueOnce(new Promise<string>(done => { resolve = done; }));
  const hook = await renderHook<ReturnType<typeof useQuestionRecording>, { id: string }>(({ id }) => useQuestionRecording(id, text), { initialProps: { id: 'opi-core-001' } });
  await hook.rerender({ id: 'new-question' });
  await act(() => resolve(recordings.records['opi-core-001'].textSha256));
  expect(hook.result.current.uri).toBeUndefined();
  expect(mockAsset).toHaveBeenLastCalledWith(undefined);
});
it('matches every published recording to the existing source manifest by text and audio checksum', () => {
  expect(Object.keys(recordings.records)).toHaveLength(source.rows.length + supplemental.rows.length);
  for (const row of source.rows) {
    const record = (recordings.records as Record<string, { textSha256: string; path: string }>)[row.id];
    expect(record.textSha256).toBe(createHash('sha256').update(row.text).digest('hex'));
    expect(record.path).toBe(`/question-bank-assets/revisions/opi/${row.sha256}/audio/opi/rev13/${row.file}`);
  }
});

it('covers every current OPI audio text with a matching private recording', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  const directory = 'content/question-banks/banks/opi/topics';
  const ids = new Set<string>();
  for (const file of fs.readdirSync(directory).filter((name: string) => name.endsWith('.json'))) {
    const topic = JSON.parse(fs.readFileSync(`${directory}/${file}`, 'utf8'));
    for (const card of topic.cards) {
      if (card.kind === 'image' || !card.audioText) continue;
      expect(ids.has(card.id)).toBe(false);
      ids.add(card.id);
      const record = (recordings.records as Record<string, { textSha256: string; path: string }>)[card.id];
      expect(record).toBeDefined();
      expect(record.textSha256).toBe(createHash('sha256').update(card.audioText).digest('hex'));
    }
  }
  expect([...ids].sort()).toEqual(Object.keys(recordings.records).sort());
});
it('pins each new Mac recording to its checked-in MP3 bytes', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  expect(supplemental.settings.provider).toBe('macOS-say');
  expect(supplemental.rows).toHaveLength(1167);
  for (const row of supplemental.rows) {
    const bytes = fs.readFileSync(`content/question-banks/web-audio/opi/${row.file}`);
    expect(bytes.length).toBe(row.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
    expect(row.duration).toBeGreaterThan(0.4);
    expect(row.peakDb).toBeGreaterThan(-60);
    const record = (recordings.records as Record<string, { textSha256: string; path: string }>)[row.id];
    expect(record.textSha256).toBe(createHash('sha256').update(row.text).digest('hex'));
    expect(record.path).toBe(`/question-bank-assets/revisions/opi/${row.sha256}/audio/opi/web-v1/${row.file}`);
  }
});
