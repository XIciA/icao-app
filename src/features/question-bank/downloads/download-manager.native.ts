import { compactDownloadError } from './download-feedback';
import { publishDownloadAvailability } from './download-events';
import { audioSessionOrchestrator } from '@/platform/audio/audio-session-orchestrator';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { Paths } from 'expo-file-system';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { COMMERCE_ENVIRONMENT_HEADER, offlineScopeIncludes, type OfflineDownloadScope, type OfflineManifest,
  type ContentAccessCredential, type QuestionBankTopicRelease, type ResolvedResource } from '@icao/contracts';
import Storage from '@/platform/storage';
import { apiRequest } from '@/platform/api-client';
import { getNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment';
import { cacheMemberResource, currentQuestionBankContentAccountId, questionBankContentAccountGeneration,
  writeMemberTopicCache, rebaseOfflineTopic, offlineCredentialNeedsRefresh, renewOfflineCredentials, invalidateOfflineResource, invalidateOfflineTopic, removeOfflineResources,
  verifyOfflineResource, offlineResourcePrepared, readMemberTopicCache } from '../data/member-content-cache.native';
import { withContentRelease } from '../data/content-version.native';
import { remoteQuestionBankRepository } from '../data/repository.native';
import type { QuestionBankId, QuestionBankTopic } from '../types';

export type DownloadPhase = 'idle' | 'queued' | 'downloading' | 'verifying' | 'paused' | 'error';
export type DownloadPackage = {
  saved?: OfflineManifest; target?: OfflineManifest; latest?: OfflineManifest;
  phase: DownloadPhase; completed: number; total: number; error?: string; outdated?: boolean;
};
export type DownloadPackageId = QuestionBankId | 'vocabulary:preview' | 'vocabulary:icao4' | 'vocabulary:icao5';
export const downloadPackageId = (manifest: OfflineManifest) => (manifest.bankId === 'vocabulary' ? `vocabulary:${manifest.scope}` : manifest.bankId) as DownloadPackageId;
type State = Partial<Record<DownloadPackageId, DownloadPackage>>;
const listeners = new Set<() => void>();
let state: State = {};
let owner = '';
let environment = '';
let generation = 0;
let serial = Promise.resolve();
let lastProgressPersist = 0;
const persistedManifests = new Set<string>();
let hydrate: Promise<void> | undefined;
let running = false;
let checking: Promise<string> | undefined;
const tasks: { bankId: DownloadPackageId; manifest: OfflineManifest; cellular: boolean; epoch: number; token: number }[] = [];
const tokens = new Map<string, number>();
const deleting = new Set<string>();
const manifestRequests = new Map<string, Promise<OfflineManifest>>();
const key = () => `icao.downloads.v1.${owner}.${environment}`;
let availability = '';
const changed = () => {
  const next = JSON.stringify([owner, environment, Object.entries(state).map(([bank, item]) => [bank, item?.saved?.fingerprint, item?.phase === 'paused', item?.outdated])]);
  if (next !== availability) { availability = next; publishDownloadAvailability(); }
  listeners.forEach(listener => listener());
};
export const subscribeDownloads = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const EMPTY_STATE: State = {};
export const downloadSnapshot = () => owner === (currentQuestionBankContentAccountId() ?? '') && environment === getNativeCommerceEnvironment() ? state : EMPTY_STATE;
function save() {
  const storageKey = key(); const snapshot = state; const epoch = generation;
  const account = owner; const contentGeneration = questionBankContentAccountGeneration();
  const current = () => epoch === generation && account === currentQuestionBankContentAccountId() && contentGeneration === questionBankContentAccountGeneration();
  serial = serial.catch(() => undefined).then(async () => {
    if (!current()) return;
    const records: Record<string, unknown> = {};
    const referenced = new Set<string>();
    for (const [bank, item] of Object.entries(snapshot)) {
      const record = { ...item } as Record<string, unknown>;
      for (const field of ['saved', 'target', 'latest'] as const) {
        const manifest = item?.[field];
        if (!manifest) continue;
        const reference = `${storageKey}.manifest.${bank}.${manifest.scope}.${manifest.version}.${manifest.checksum}.${manifest.fingerprint}`;
        referenced.add(reference);
        if (!persistedManifests.has(reference)) {
          if (!current()) return;
          await Storage.setItem(reference, JSON.stringify(manifest));
          persistedManifests.add(reference);
        }
        record[field] = reference;
      }
      records[bank] = record;
    }
    if (!current()) return;
    await Storage.setItem(storageKey, JSON.stringify(records));
    for (const previous of persistedManifests) {
      if (previous.startsWith(`${storageKey}.manifest.`) && !referenced.has(previous)) {
        await Storage.removeItem(previous); persistedManifests.delete(previous);
      }
    }
  }).catch(error => {
    if (current()) {
      state = Object.fromEntries(Object.entries(state).map(([bank, item]) => [bank, { ...item, phase: 'error', target: item?.target ?? item?.saved, error: '本机保存失败，请重试' }]));
      changed();
    }
    throw error;
  });
  changed(); return serial;
}
function patch(bankId: DownloadPackageId, value: Partial<DownloadPackage>) {
  state = { ...state, [bankId]: { phase: 'idle', completed: 0, total: 0, ...state[bankId], ...value } };
  if (Object.keys(value).every(field => field === 'completed') && Date.now() - lastProgressPersist < 1000) {
    changed(); return Promise.resolve();
  }
  lastProgressPersist = Date.now();
  return save();
}
export async function prepareDownloads() {
  const account = currentQuestionBankContentAccountId() ?? '';
  const env = getNativeCommerceEnvironment();
  if (account === owner && env === environment && hydrate) return hydrate;
  owner = account; environment = env; generation++; state = {}; persistedManifests.clear(); tasks.length = 0; changed();
  const epoch = generation; const storageKey = key();
  hydrate = (async () => {
    const raw = account ? await Storage.getItem(storageKey) : null;
    if (epoch !== generation) return;
    try { const parsed = raw ? JSON.parse(raw) : {}; state = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as State : {}; } catch { state = {}; }
    for (const item of Object.values(state)) {
      if (!item) continue;
      for (const field of ['saved', 'target', 'latest'] as const) {
        const reference = item[field] as unknown;
        if (typeof reference === 'string' && reference.startsWith(`${storageKey}.manifest.`)) {
          const rawManifest = await Storage.getItem(reference);
          if (epoch !== generation) return;
          try { item[field] = rawManifest ? JSON.parse(rawManifest) as OfflineManifest : undefined; } catch { item[field] = undefined; }
          persistedManifests.add(reference);
        }
      }
      if (['queued', 'downloading', 'verifying'].includes(item.phase)) item.phase = 'paused';
    }
    changed();
  })();
  return hydrate;
}
export async function loadDownloadManifest(bankId: QuestionBankId | 'vocabulary', scope: OfflineDownloadScope) {
  await prepareDownloads();
  const epoch = generation; const requestKey = `${owner}/${environment}/${bankId}/${scope}`;
  let pending = manifestRequests.get(requestKey);
  if (!pending) {
    pending = apiRequest<OfflineManifest>(bankId === 'vocabulary' ? `/v1/vocabulary/offline?book=${scope}` : `/v1/question-banks/${bankId}/offline?scope=${scope}`,
      { headers: { [COMMERCE_ENVIRONMENT_HEADER]: environment } }).then(manifest => {
      if (manifest.bankId !== bankId || manifest.scope !== scope || !Array.isArray(manifest.resources)
        || !Array.isArray(manifest.topics) || !Number.isFinite(manifest.sizeBytes) || manifest.sizeBytes < 0) throw new Error('清单暂不可用');
      return manifest;
    }).finally(() => manifestRequests.delete(requestKey));
    manifestRequests.set(requestKey, pending);
  }
  const manifest = await pending;
  if (epoch !== generation || requestKey !== `${currentQuestionBankContentAccountId() ?? ''}/${getNativeCommerceEnvironment()}/${bankId}/${scope}`) throw new Error('账号已切换');
  return manifest;
}
async function compare(bankId: DownloadPackageId, latest: OfflineManifest) {
  const saved = state[bankId]?.saved;
  if (!saved || latest.bankId !== saved.bankId || latest.scope !== saved.scope) return;
  const account = owner; const epoch = generation; const accountGeneration = questionBankContentAccountGeneration();
  const current = () => account === currentQuestionBankContentAccountId() && epoch === generation && accountGeneration === questionBankContentAccountGeneration() && state[bankId]?.saved === saved;
  const scopes = [];
  for (const topic of saved.topics) {
    if (!current()) return;
    if (await offlineCredentialNeedsRefresh(topic)) scopes.push({ bankId: saved.bankId, categoryId: topic.categoryId, topicId: topic.topicId });
  }
  // Credential renewal is independent of resource replacement; no media is downloaded.
  for (let offset = 0; offset < scopes.length; offset += 24) {
    if (!current()) return;
    try {
      const credential = await apiRequest<ContentAccessCredential>('/v1/content-access/credentials', { method: 'POST',
        headers: { [COMMERCE_ENVIRONMENT_HEADER]: environment, 'content-type': 'application/json' }, body: JSON.stringify({ scopes: scopes.slice(offset, offset + 24) }) });
      if (!current()) return;
      await renewOfflineCredentials(credential);
    } catch { /* Existing signed expiry remains authoritative. */ }
  }
  if (!current()) return;
  const resources = new Map(latest.resources.map(resource => [resource.publicPath, resource.checksum]));
  const topics = new Map(latest.topics.map(topic => [topic.topicId, topic]));
  for (const resource of saved.resources) {
    if (!current()) return;
    const publishedChecksum = resources.get(resource.publicPath);
    // Removing a word from one book does not retire audio still used by another
    // downloaded package. A changed checksum, however, invalidates the old bytes globally.
    const shared = publishedChecksum === undefined && Object.entries(state).some(([otherId, item]) => otherId !== bankId
      && (item?.latest ?? item?.target ?? item?.saved)?.resources.some(other => other.publicPath === resource.publicPath && other.checksum === resource.checksum));
    if (!shared && publishedChecksum !== resource.checksum) await invalidateOfflineResource(resource.publicPath, resource.checksum);
  }
  for (const topic of saved.topics) {
    if (!current()) return;
    const next = topics.get(topic.topicId);
    const changed = !next || next.metadataChecksum !== topic.metadataChecksum ? topic.cardIds
      : topic.cardIds.filter(id => next.cardChecksums[id] !== topic.cardChecksums[id]);
    if (changed.length) {
      await invalidateOfflineTopic(topic, changed);
      // Text validity is per card. Shared audio remains usable when its checksum
      // still matches the published manifest; the resource loop handles replacement.
    }
    if (!current()) return;
    if (next && latest.version !== saved.version) await rebaseOfflineTopic(next, { bankId, version: latest.version, checksum: latest.checksum });
  }
  let missing = false;
  for (const resource of saved.resources) if (!await offlineResourcePrepared(resource.publicPath, resource)) { missing = true; break; }
  if (!current() || state[bankId]?.saved !== saved) return;
  await patch(bankId, { latest, outdated: missing || latest.fingerprint !== saved.fingerprint });
}
export function checkDownloadUpdates(): Promise<string> {
  if (checking) return checking;
  checking = (async () => {
    await prepareDownloads();
    const epoch = generation, account = owner, accountGeneration = questionBankContentAccountGeneration();
    const ensureOwner = () => { if (epoch !== generation || account !== currentQuestionBankContentAccountId() || accountGeneration !== questionBankContentAccountGeneration()) throw new Error('账号已切换'); };
    const banks = Object.entries(state).filter(([, item]) => item?.saved) as [DownloadPackageId, DownloadPackage][];
    if (!banks.length) return '暂无下载';
    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false || network.isInternetReachable === false) return '当前离线';
    ensureOwner();
    let failures = 0; let updates = 0;
    for (const [bankId, item] of banks) {
      ensureOwner();
      try {
        const latest = await loadDownloadManifest(item.saved!.bankId as QuestionBankId | 'vocabulary', item.saved!.scope);
        ensureOwner();
        if (state[bankId]?.saved !== item.saved) continue;
        await compare(bankId, latest);
        if (state[bankId]?.outdated) updates++;
      } catch { failures++; }
    }
    ensureOwner();
    return failures ? failures === banks.length ? '检查失败' : '部分检查失败' : updates ? `${updates} 项有更新` : '已是最新';
  })().finally(() => { checking = undefined; });
  return checking;
}
export async function startDownload(manifest: OfflineManifest, cellular = false) {
  await prepareDownloads();
  if (!owner) throw new Error('请先登录');
  const bankId = downloadPackageId(manifest);
  if (deleting.has(bankId) || ['queued', 'downloading', 'verifying'].includes(state[bankId]?.phase ?? '')) return;
  const epoch = generation, account = owner, accountGeneration = questionBankContentAccountGeneration();
  const token = (tokens.get(bankId) ?? 0) + 1; tokens.set(bankId, token);
  await patch(bankId, { target: manifest, phase: 'queued', error: undefined, total: manifest.resources.length + manifest.topics.length, completed: 0 });
  if (epoch !== generation || account !== currentQuestionBankContentAccountId() || accountGeneration !== questionBankContentAccountGeneration()) throw new Error('账号已切换');
  tasks.push({ bankId, manifest, cellular, epoch, token });
  void drain().catch(() => undefined);
}
export async function cancelDownload(bankId: DownloadPackageId) {
  tokens.set(bankId, (tokens.get(bankId) ?? 0) + 1);
  await patch(bankId, { phase: 'paused', error: undefined });
}
async function drain() {
  if (running) return;
  running = true;
  try {
    while (tasks.length) {
      const task = tasks.shift()!;
      const { bankId, epoch, token } = task;
      let manifest = task.manifest;
      const contentGeneration = questionBankContentAccountGeneration();
      const account = owner;
      const current = () => epoch === generation && token === tokens.get(bankId)
        && account === currentQuestionBankContentAccountId() && contentGeneration === questionBankContentAccountGeneration();
      if (!current()) continue;
      const ensure = async () => {
        if (!current()) throw new Error('下载已暂停');
        if (AppState.currentState !== 'active' && AppState.currentState !== null) throw new Error('下载已暂停');
        const network = await Network.getNetworkStateAsync();
        if (!network.isConnected || network.isInternetReachable === false) throw new Error('网络中断，可继续下载');
        if (!task.cellular && network.type === Network.NetworkStateType.CELLULAR) throw new Error('已切换移动网络，请确认后继续');
        if (!current()) throw new Error('下载已暂停');
      };
      const networkListener = Network.addNetworkStateListener(network => {
        if (!current() || state[bankId]?.phase === 'verifying') return;
        if (!network.isConnected || network.isInternetReachable === false || !task.cellular && network.type === Network.NetworkStateType.CELLULAR) {
          const pausedToken = token + 1;
          void cancelDownload(bankId).then(() => {
            if (epoch === generation && account === currentQuestionBankContentAccountId() && contentGeneration === questionBankContentAccountGeneration() && tokens.get(bankId) === pausedToken) return patch(bankId, { error: network.type === Network.NetworkStateType.CELLULAR ? '已切换移动网络，请确认后继续' : '网络中断，可继续下载' });
          }).catch(() => undefined);
        }
      });
      const appListener = AppState.addEventListener('change', next => { if (next !== 'active' && current()) void cancelDownload(bankId); });
      try {
        await ensure();
        manifest = await loadDownloadManifest(manifest.bankId as QuestionBankId | 'vocabulary', manifest.scope);
        await ensure();
        if (state[bankId]?.saved) await compare(bankId, state[bankId]?.saved?.scope === manifest.scope ? manifest
          : await loadDownloadManifest(manifest.bankId as QuestionBankId | 'vocabulary', state[bankId]!.saved!.scope));
        await ensure();
        await patch(bankId, { target: manifest, total: manifest.resources.length + manifest.topics.length });
        // Include encrypted output and transfer staging; existing content remains intact on failure.
        if (Paths.availableDiskSpace < Math.max(...manifest.resources.map(r => r.sizeBytes), 0) * 2 + await remainingDownloadBytes(manifest)) throw new Error('空间不足，请清理后继续');
        await patch(bankId, { phase: 'downloading', completed: 0 });
        if (manifest.vocabulary) {
          const { prepareVocabularyDownload } = require('@/features/vocabulary/offline-content.native') as typeof import('@/features/vocabulary/offline-content.native');
          await prepareVocabularyDownload(manifest);
        } else await remoteQuestionBankRepository.getDataset(bankId as QuestionBankId);
        const headers = { [COMMERCE_ENVIRONMENT_HEADER]: environment };
        let completed = 0;
        const credentials = new Map<string, ContentAccessCredential>();
        for (const descriptor of manifest.topics) {
          await ensure();
          const previous = state[bankId]?.saved?.topics.find(topic => topic.topicId === descriptor.topicId);
          if (previous?.checksum === descriptor.checksum && previous.metadataChecksum === descriptor.metadataChecksum) {
            const local = await readMemberTopicCache(account, descriptor);
            if (local && descriptor.cardIds.every(id => local.cards.some(card => card.id === id))) {
              await rebaseOfflineTopic(descriptor, { bankId, version: manifest.version, checksum: manifest.checksum });
              await patch(bankId, { completed: ++completed });
              continue;
            }
          }
          const release = await apiRequest<QuestionBankTopicRelease<QuestionBankTopic>>(`/v1/question-banks/${bankId}/categories/${encodeURIComponent(descriptor.categoryId)}/topics/${encodeURIComponent(descriptor.topicId)}?version=${manifest.version}&checksum=${manifest.checksum}`, { headers });
          if (release.bankId !== bankId || release.categoryId !== descriptor.categoryId || release.topic.id !== descriptor.topicId || release.version !== manifest.version || release.checksum !== manifest.checksum) throw new Error('题库已变化，请检查更新');
          const ids = new Set(descriptor.cardIds);
          const cards = release.topic.cards.filter(card => ids.has(card.id));
          if (cards.length !== ids.size) throw new Error('需要有效会员权限');
          const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(cards));
          if (hash !== descriptor.checksum) throw new Error('题库已变化，请检查更新');
          if (!credentials.has(descriptor.topicId)) {
            const offset = manifest.topics.indexOf(descriptor);
            const scopes = manifest.topics.slice(offset, offset + 24).map(topic => ({ bankId, categoryId: topic.categoryId, topicId: topic.topicId, version: manifest.version }));
            const credential = await apiRequest<ContentAccessCredential>('/v1/content-access/credentials', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ scopes }) });
            for (const scope of scopes) credentials.set(scope.topicId, credential);
          }
          const credential = credentials.get(descriptor.topicId)!;
          await ensure();
          await writeMemberTopicCache(account, descriptor, withContentRelease({ ...release.topic, cards }, { bankId, version: manifest.version, checksum: manifest.checksum }), credential);
          if (!current()) throw new Error('下载已暂停');
          await patch(bankId, { completed: ++completed });
        }
        let signed = new Map<string, ResolvedResource>();
        let signedUntil = 0;
        for (let index = 0; index < manifest.resources.length; index++) {
          const resource = manifest.resources[index];
          await ensure();
          if (await offlineResourcePrepared(resource.publicPath, resource)) {
            await patch(bankId, { completed: ++completed }); continue;
          }
          if (Date.now() >= signedUntil) signed.clear();
          if (!signed.has(resource.publicPath)) {
            const batch = [];
            for (const candidate of manifest.resources.slice(index, index + 24)) {
              if (!await offlineResourcePrepared(candidate.publicPath, candidate)) batch.push({ publicPath: candidate.publicPath, checksum: candidate.checksum });
            }
            const response = await apiRequest<ResolvedResource[]>('/v1/resources/resolve-batch', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ resources: batch }) });
            signed = new Map(response.map(value => [value.publicPath, value]));
            signedUntil = Date.now() + Math.max(0, Math.min(...response.map(value => value.expiresIn)) - 30) * 1000;
          }
          const resolved = signed.get(resource.publicPath);
          if (!resolved) throw new Error('资源暂不可用，请重试');
          if (resolved.checksum !== resource.checksum || resolved.sizeBytes !== resource.sizeBytes) throw new Error('资源已变化，请检查更新');
          const uri = await cacheMemberResource(resource.publicPath, resolved.url, resource, { isCurrent: current, required: true, publicDownload: Boolean(manifest.vocabulary) });
          if (!uri) throw new Error('资源暂不可用，请继续下载');
          await ensure();
          await patch(bankId, { completed: ++completed });
        }
        await patch(bankId, { phase: 'verifying' });
        if (manifest.vocabulary) {
          const { verifyVocabularyDownload } = require('@/features/vocabulary/offline-content.native') as typeof import('@/features/vocabulary/offline-content.native');
          await verifyVocabularyDownload(manifest);
        }
        for (const topic of manifest.topics) if (!await readMemberTopicCache(account, topic)) throw new Error('内容校验失败，请重试');
        for (const resource of manifest.resources) {
          if (!current()) throw new Error('下载已暂停');
          if (!await verifyOfflineResource(resource.publicPath, resource)) throw new Error('资源校验失败，请重试');
        }
        if (!current()) throw new Error('下载已暂停');
        await patch(bankId, { saved: manifest, target: undefined, phase: 'idle', outdated: false, error: undefined });
        try { await compare(bankId, await loadDownloadManifest(manifest.bankId as QuestionBankId | 'vocabulary', manifest.scope)); } catch { /* Complete is not a claim of latest. */ }
      } catch (error) {
        if (current()) await patch(bankId, { phase: 'paused', error: compactDownloadError(error) });
      } finally { networkListener.remove(); appListener.remove(); }
    }
  } finally { running = false; }
}
export async function deleteDownload(bankId: DownloadPackageId) {
  await prepareDownloads();
  if (deleting.has(bankId)) return;
  deleting.add(bankId);
  try {
  const epoch = generation; const account = owner;
  await cancelDownload(bankId);
  await audioSessionOrchestrator.stopContentPlayback();
  if (bankId.startsWith('vocabulary:')) { const { stopVocabularySpeech } = require('@/features/vocabulary/speech.native') as typeof import('@/features/vocabulary/speech.native'); await stopVocabularySpeech(); }
  if (epoch !== generation || account !== currentQuestionBankContentAccountId()) return;
  const item = state[bankId];
  const manifests = [item?.saved, item?.target].filter((m): m is OfflineManifest => Boolean(m));
  const other = Object.entries(state).filter(([id]) => id !== bankId).flatMap(([, value]) => [value?.saved, value?.target]).filter((m): m is OfflineManifest => Boolean(m));
  const retained = new Set(other.flatMap(m => m.resources.map(r => r.publicPath)));
  await removeOfflineResources([...new Set(manifests.flatMap(m => m.resources.map(r => r.publicPath)))].filter(path => !retained.has(path)), manifests.flatMap(m => m.topics));
  if (epoch !== generation || account !== currentQuestionBankContentAccountId()) return;
  state = { ...state }; delete state[bankId]; await save();
  } finally { deleting.delete(bankId); }
}
export function packageIncludes(item: DownloadPackage | undefined, scope: OfflineDownloadScope) {
  return Boolean(item?.saved && (item.saved.vocabulary ? item.saved.scope === scope : offlineScopeIncludes(item.saved.scope, scope)));
}

export async function reconcileDownloadedBank(bankId: QuestionBankId) {
  await prepareDownloads();
  const item = state[bankId];
  if (item?.saved) await compare(bankId, await loadDownloadManifest(bankId, item.saved.scope));
}

export async function remainingDownloadBytes(manifest: OfflineManifest) {
  let bytes = manifest.topics.reduce((sum, topic) => sum + topic.sizeBytes, 0);
  for (const resource of manifest.resources) if (!await offlineResourcePrepared(resource.publicPath, resource)) bytes += resource.sizeBytes;
  return bytes;
}
