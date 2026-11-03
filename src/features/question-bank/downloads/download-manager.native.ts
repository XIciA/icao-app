import { requestContentCredentials } from '../data/content-credential-client.native';
import { resourceAddresses, retryResourceTransfer } from './resource-addresses';
import { DOWNLOAD_RESOURCE_WORKERS, runResourceWorkers } from './resource-work-queue';
import { compactDownloadError, downloadRetryDelay } from './download-feedback';
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

export type DownloadPhase = 'idle' | 'queued' | 'preparing' | 'downloading' | 'verifying' | 'paused' | 'error';
export type DownloadPackage = {
  saved?: OfflineManifest; target?: OfflineManifest; latest?: OfflineManifest;
  autoResume?: boolean; cellular?: boolean;
  retryAt?: number; retryCount?: number; errorCode?: string;
  phase: DownloadPhase; completed: number; total: number; downloadedBytes?: number; totalBytes?: number; error?: string; outdated?: boolean;
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
  const next = JSON.stringify([owner, environment, Object.entries(state).map(([bank, item]) => [bank, item?.saved?.fingerprint, item?.target?.fingerprint, item?.latest?.fingerprint, item?.phase === 'paused', item?.outdated])]);
  if (next !== availability) { availability = next; publishDownloadAvailability(); }
  listeners.forEach(listener => listener());
};
export const subscribeDownloads = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const EMPTY_STATE: State = {};
export const downloadSnapshot = () => owner === (currentQuestionBankContentAccountId() ?? '') && environment === getNativeCommerceEnvironment() ? state : EMPTY_STATE;
function save(affectedBank?: DownloadPackageId) {
  const affectedToken = affectedBank ? tokens.get(affectedBank) : undefined;
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
      if (affectedBank && tokens.get(affectedBank) === affectedToken && state[affectedBank]) {
        tokens.set(affectedBank, (affectedToken ?? 0) + 1);
        state = { ...state, [affectedBank]: { ...state[affectedBank]!, phase: 'error', autoResume: false, error: '保存失败' } };
      }
      changed();
    }
    throw error;
  });
  changed(); return serial;
}
function patch(bankId: DownloadPackageId, value: Partial<DownloadPackage>) {
  state = { ...state, [bankId]: { phase: 'idle', completed: 0, total: 0, ...state[bankId], ...value } };
  if (Object.keys(value).every(field => ['completed', 'downloadedBytes', 'totalBytes'].includes(field)) && Date.now() - lastProgressPersist < 1000) {
    changed(); return Promise.resolve();
  }
  lastProgressPersist = Date.now();
  return save(bankId);
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
      if (['queued', 'preparing', 'downloading', 'verifying'].includes(item.phase)) { item.phase = 'paused'; item.autoResume ??= true; }
      // 3596169 lost the HTTP status and disabled recovery for every credential
      // failure. Re-evaluate that legacy failure once; explicit pauses have no
      // error and remain untouched. Current errors retain their original code.
      if (item.phase === 'paused' && item.target && item.error === '待验证' && !item.errorCode) {
        item.autoResume = true; item.errorCode = 'legacy_credential_failure';
      }
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
      const credentials = await requestContentCredentials(scopes.slice(offset, offset + 24), { forceRefresh: true, isCurrent: current });
      if (!current()) return;
      for (const credential of new Set(credentials)) { if (!current()) return; await renewOfflineCredentials(credential); }
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
    if (!banks.length) return Object.values(state).some(item => item?.target) ? '有未完成下载' : '暂无下载';
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
    return failures ? failures === banks.length ? '检查失败' : '部分检查失败' : updates ? `${updates} 项有更新`
      : Object.values(state).some(item => item?.target) ? '已下载项为最新' : '已是最新';
  })().finally(() => { checking = undefined; });
  return checking;
}
export async function startDownload(manifest: OfflineManifest, cellular = false, automatic = false) {
  await prepareDownloads();
  if (!owner) throw new Error('请先登录');
  const bankId = downloadPackageId(manifest);
  if (deleting.has(bankId) || ['queued', 'preparing', 'downloading', 'verifying'].includes(state[bankId]?.phase ?? '')) return;
  const epoch = generation, account = owner, accountGeneration = questionBankContentAccountGeneration();
  const token = (tokens.get(bankId) ?? 0) + 1; tokens.set(bankId, token);
  await patch(bankId, { target: manifest, phase: 'queued', autoResume: true, cellular, error: undefined, errorCode: undefined,
    retryAt: undefined, retryCount: automatic ? state[bankId]?.retryCount : 0,
    total: manifest.resources.length + manifest.topics.length, totalBytes: manifest.sizeBytes });
  if (epoch !== generation || account !== currentQuestionBankContentAccountId() || accountGeneration !== questionBankContentAccountGeneration()) throw new Error('账号已切换');
  tasks.push({ bankId, manifest, cellular, epoch, token });
  void drain().catch(() => undefined);
}
export async function cancelDownload(bankId: DownloadPackageId) {
  tokens.set(bankId, (tokens.get(bankId) ?? 0) + 1);
  await patch(bankId, { phase: 'paused', autoResume: false, error: undefined, errorCode: undefined, retryAt: undefined });
}
/** App-owned lifecycle. Leaving the download screen never disposes the queue. */
export function observeDownloadRuntime() {
  let active = true;
  let foreground = AppState.currentState !== 'background';
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let resuming = false;
  let resumeRequested = false;
  const resume = async () => {
    if (!active) return;
    if (resuming) { resumeRequested = true; return; }
    resuming = true;
    try {
      await prepareDownloads();
      const epoch = generation;
      const network = await Network.getNetworkStateAsync();
      if (!active || !foreground || epoch !== generation || network.isConnected === false || network.isInternetReachable === false) return;
      for (const item of Object.values(state)) {
        if (!active || epoch !== generation) return;
        if (item?.phase === 'paused' && item.autoResume && item.target && (item.retryAt ?? 0) <= Date.now()
          && (item.cellular || network.type !== Network.NetworkStateType.CELLULAR)) await startDownload(item.target, item.cellular, true);
      }
    } finally {
      resuming = false;
      if (resumeRequested) { resumeRequested = false; void resume().catch(() => undefined); }
    }
  };
  const scheduleRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
    if (!active || !foreground) return;
    const times = Object.values(state).flatMap(item => item?.phase === 'paused' && item.autoResume && item.target && item.retryAt ? [item.retryAt] : []);
    if (times.length) retryTimer = setTimeout(() => { retryTimer = undefined; void resume().catch(() => undefined); }, Math.max(0, Math.min(...times) - Date.now()));
  };
  const unsubscribe = subscribeDownloads(scheduleRetry);
  const suspend = (reason: string, cellularOnly = false) => {
    for (const [id, item] of Object.entries(state)) {
      if (!item || cellularOnly && item.cellular || !['queued', 'preparing', 'downloading', 'verifying'].includes(item.phase)) continue;
      const bankId = id as DownloadPackageId;
      tokens.set(bankId, (tokens.get(bankId) ?? 0) + 1);
      void patch(bankId, { phase: 'paused', autoResume: true, error: reason }).catch(() => undefined);
    }
  };
  const network = Network.addNetworkStateListener(value => {
    if (value.isConnected === false || value.isInternetReachable === false) suspend('等待网络');
    else { if (value.type === Network.NetworkStateType.CELLULAR) suspend('等待 Wi-Fi', true); void resume().catch(() => undefined); }
  });
  const app = AppState.addEventListener('change', value => {
    foreground = value !== 'background';
    if (value === 'background') suspend('已暂停');
    else if (value === 'active') void resume().catch(() => undefined);
    scheduleRetry();
  });
  scheduleRetry();
  void resume().catch(() => undefined);
  return () => { active = false; if (retryTimer) clearTimeout(retryTimer); unsubscribe(); network.remove(); app.remove(); };
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
        && account === currentQuestionBankContentAccountId() && contentGeneration === questionBankContentAccountGeneration()
        && environment === getNativeCommerceEnvironment();
      if (!current()) continue;
      let network: Awaited<ReturnType<typeof Network.getNetworkStateAsync>>;
      const ensure = async () => {
        if (!current()) throw new Error('下载已暂停');
        if (AppState.currentState === 'background') throw new Error('下载已暂停');
        if (network.isConnected === false || network.isInternetReachable === false) throw new Error('网络中断');
        if (!task.cellular && network.type === Network.NetworkStateType.CELLULAR) throw new Error('等待 Wi-Fi');
      };
      const networkListener = Network.addNetworkStateListener(value => { network = value; });
      try {
        network = await Network.getNetworkStateAsync();
        await ensure();
        manifest = await loadDownloadManifest(manifest.bankId as QuestionBankId | 'vocabulary', manifest.scope);
        await ensure();
        if (state[bankId]?.saved) await compare(bankId, state[bankId]?.saved?.scope === manifest.scope ? manifest
          : await loadDownloadManifest(manifest.bankId as QuestionBankId | 'vocabulary', state[bankId]!.saved!.scope));
        await ensure();
        await patch(bankId, { target: manifest, total: manifest.resources.length + manifest.topics.length });
        // Include encrypted output and transfer staging; existing content remains intact on failure.
        if (Paths.availableDiskSpace < Math.max(...manifest.resources.map(r => r.sizeBytes), 0) * 2 + await remainingDownloadBytes(manifest)) throw new Error('空间不足，请清理后继续');
        await patch(bankId, { phase: 'preparing', totalBytes: manifest.sizeBytes });
        if (manifest.vocabulary) {
          const { prepareVocabularyDownload } = require('@/features/vocabulary/offline-content.native') as typeof import('@/features/vocabulary/offline-content.native');
          await prepareVocabularyDownload(manifest);
        } else await remoteQuestionBankRepository.getDataset(bankId as QuestionBankId);
        const headers = { [COMMERCE_ENVIRONMENT_HEADER]: environment };
        let completed = 0;
        const credentialBatches = new Map<number, Promise<ContentAccessCredential[]>>();
        await runResourceWorkers(manifest.topics, 2, current, async (descriptor, workerCurrent) => {
          await ensure();
          const previous = state[bankId]?.saved?.topics.find(topic => topic.topicId === descriptor.topicId);
          if (previous?.checksum === descriptor.checksum && previous.metadataChecksum === descriptor.metadataChecksum) {
            const local = await readMemberTopicCache(account, descriptor);
            if (local && descriptor.cardIds.every(id => local.cards.some(card => card.id === id))
              && await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(local.cards.filter(card => descriptor.cardIds.includes(card.id)))) === descriptor.checksum) {
              if (!workerCurrent()) return;
              await rebaseOfflineTopic(descriptor, { bankId, version: manifest.version, checksum: manifest.checksum });
              if (!workerCurrent()) return;
              await patch(bankId, { completed: ++completed });
              return;
            }
          }
          const release = await apiRequest<QuestionBankTopicRelease<QuestionBankTopic>>(`/v1/question-banks/${bankId}/categories/${encodeURIComponent(descriptor.categoryId)}/topics/${encodeURIComponent(descriptor.topicId)}?version=${manifest.version}&checksum=${manifest.checksum}`, { headers });
          if (release.bankId !== bankId || release.categoryId !== descriptor.categoryId || release.topic.id !== descriptor.topicId || release.version !== manifest.version || release.checksum !== manifest.checksum) throw new Error('题库已变化，请检查更新');
          const ids = new Set(descriptor.cardIds);
          const cards = release.topic.cards.filter(card => ids.has(card.id));
          if (cards.length !== ids.size) throw new Error('需要有效会员权限');
          const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(cards));
          if (hash !== descriptor.checksum) throw new Error('题库已变化，请检查更新');
          const offset = Math.floor(manifest.topics.indexOf(descriptor) / 24) * 24;
          let credentialRequest = credentialBatches.get(offset);
          if (!credentialRequest) {
            const scopes = manifest.topics.slice(offset, offset + 24).map(topic => ({ bankId, categoryId: topic.categoryId, topicId: topic.topicId, version: manifest.version }));
            credentialRequest = requestContentCredentials(scopes, { isCurrent: current });
            credentialBatches.set(offset, credentialRequest);
          }
          const credential = (await credentialRequest)[manifest.topics.indexOf(descriptor) - offset];
          await ensure();
          if (!workerCurrent()) return;
          await writeMemberTopicCache(account, descriptor, withContentRelease({ ...release.topic, cards }, { bankId, version: manifest.version, checksum: manifest.checksum }), credential);
          if (!current()) throw new Error('下载已暂停');
          await patch(bankId, { completed: ++completed });
        });
        // Bytes are transient during a transfer; persist only bounded completed-resource updates.
        const byteProgress = new Map<string, number>();
        const verifiedThisRun = new Set<string>();
        let lastPaint = 0;
        const textBytes = Math.max(0, manifest.sizeBytes - manifest.resources.reduce((sum, resource) => sum + resource.sizeBytes, 0));
        const downloadedBytes = () => Math.min(manifest.sizeBytes, textBytes + [...byteProgress.values()].reduce((sum, bytes) => sum + bytes, 0));
        const headersForBatch = { ...headers, 'content-type': 'application/json' };
        const pending: OfflineManifest['resources'] = [];
        for (const resource of manifest.resources) {
          await ensure();
          if (await offlineResourcePrepared(resource.publicPath, resource)) {
            if (!current()) throw new Error('下载已暂停');
            byteProgress.set(resource.publicPath, resource.sizeBytes);
            completed++;
          } else pending.push(resource);
        }
        await patch(bankId, { phase: 'downloading', completed, downloadedBytes: downloadedBytes() });
        const address = resourceAddresses(pending, batch => apiRequest<ResolvedResource[]>('/v1/resources/resolve-batch', {
          method: 'POST', headers: headersForBatch,
          body: JSON.stringify({ resources: batch.map(({ publicPath, checksum }) => ({ publicPath, checksum })) }),
        }));
        await runResourceWorkers(pending, DOWNLOAD_RESOURCE_WORKERS, current, async (resource, workerCurrent) => {
          await ensure();
          if (!workerCurrent()) return;
          const uri = await retryResourceTransfer(async () => {
            const resolved = await address(resource.publicPath);
            if (!workerCurrent()) return;
            if (resolved.checksum !== resource.checksum || resolved.sizeBytes !== resource.sizeBytes) throw new Error('资源已变化，请检查更新');
            return cacheMemberResource(resource.publicPath, resolved.url, resource, {
              onVerified: () => { if (workerCurrent()) verifiedThisRun.add(resource.publicPath); },
              isCurrent: workerCurrent, required: true, publicDownload: Boolean(manifest.vocabulary),
              isPlaybackActive: () => Boolean(audioSessionOrchestrator.getActiveOwner()),
              onProgress: fraction => {
                if (!workerCurrent()) return;
                byteProgress.set(resource.publicPath, Math.floor(Math.max(0, Math.min(1, fraction)) * resource.sizeBytes));
                if (Date.now() - lastPaint < 100) return;
                lastPaint = Date.now();
                state = { ...state, [bankId]: { ...state[bankId]!, downloadedBytes: downloadedBytes() } };
                changed();
              },
            });
          }, workerCurrent);
          if (!workerCurrent()) return;
          if (!uri) throw new Error('资源暂不可用，请继续下载');
          await ensure();
          if (!workerCurrent()) return;
          byteProgress.set(resource.publicPath, resource.sizeBytes);
          await patch(bankId, { completed: ++completed, downloadedBytes: downloadedBytes() });
        });
        await ensure();
        await patch(bankId, { phase: 'verifying', downloadedBytes: manifest.sizeBytes });
        if (manifest.vocabulary) {
          const { verifyVocabularyDownload } = require('@/features/vocabulary/offline-content.native') as typeof import('@/features/vocabulary/offline-content.native');
          await verifyVocabularyDownload(manifest);
        }
        for (const topic of manifest.topics) if (!await readMemberTopicCache(account, topic)) throw new Error('内容校验失败，请重试');
        for (const resource of manifest.resources) {
          if (!current()) throw new Error('下载已暂停');
          if (!verifiedThisRun.has(resource.publicPath) && !await verifyOfflineResource(resource.publicPath, resource)) throw new Error('资源校验失败，请重试');
        }
        if (!current()) throw new Error('下载已暂停');
        await patch(bankId, { saved: manifest, target: undefined, phase: 'idle', autoResume: false, outdated: false, error: undefined,
          retryAt: undefined, retryCount: undefined, errorCode: undefined });
        try { await compare(bankId, await loadDownloadManifest(manifest.bankId as QuestionBankId | 'vocabulary', manifest.scope)); } catch { /* Complete is not a claim of latest. */ }
      } catch (error) {
        if (current()) {
          const message = error instanceof Error ? error.message : '';
          const retryCount = state[bankId]?.retryCount ?? 0;
          const delay = downloadRetryDelay(error, retryCount);
          const automatic = message === '网络中断' || message === '等待 Wi-Fi' || message === '下载已暂停';
          await patch(bankId, { phase: 'paused', autoResume: automatic || delay !== undefined,
            error: automatic ? message : delay !== undefined ? '稍后重试' : compactDownloadError(error),
            errorCode: (error as { code?: string })?.code ?? message,
            retryAt: delay === undefined ? undefined : Date.now() + delay, retryCount: retryCount + 1 }).catch(() => undefined);
        }
      } finally { networkListener.remove(); }
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
