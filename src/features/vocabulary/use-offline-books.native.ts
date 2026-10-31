import { useEffect, useState, useSyncExternalStore } from 'react';
import type { OfflineManifest, VocabularyBook } from '@icao/contracts';
import { useConnectivity } from '@/features/question-bank/platform/use-connectivity';
import { downloadAvailabilityVersion, subscribeDownloadAvailability } from '@/features/question-bank/downloads/download-events';
import { nativeCommerceEnvironmentSnapshot, subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment';
import { availableOfflineWords } from './offline-content.native';

export function useOfflineBooks(books: VocabularyBook[]) {
  const offline = useConnectivity() === 'offline';
  const version = useSyncExternalStore(subscribeDownloadAvailability, downloadAvailabilityVersion, downloadAvailabilityVersion);
  const owner = useSyncExternalStore(subscribeNativeCommerceEnvironment, nativeCommerceEnvironmentSnapshot, nativeCommerceEnvironmentSnapshot);
  const [result, setResult] = useState<{ source: VocabularyBook[]; owner: string; version: number; books: VocabularyBook[] }>();
  useEffect(() => {
    if (!offline) return;
    let current = true;
    void (async () => {
      const { prepareDownloads, downloadSnapshot } = require('@/features/question-bank/downloads/download-manager.native') as typeof import('@/features/question-bank/downloads/download-manager.native');
      await prepareDownloads();
      const packages = Object.values(downloadSnapshot());
      const manifests = packages.flatMap(item => [item?.saved, item?.target]).filter((manifest): manifest is OfflineManifest => Boolean(manifest?.vocabulary));
      const latest = packages.flatMap(item => item?.latest?.vocabulary ? [item.latest] : []);
      const available = await Promise.all(books.map(book => availableOfflineWords(book, manifests, latest)));
      if (current) setResult({ source: books, owner, version, books: available.filter(book => book.words.length > 0) });
    })().catch(() => { if (current) setResult({ source: books, owner, version, books: [] }); });
    return () => { current = false; };
  }, [books, offline, owner, version]);
  const ready = result?.source === books && result.owner === owner && result.version === version;
  return { offline, loading: offline && !ready, books: offline ? ready ? result.books : [] : books };
}
