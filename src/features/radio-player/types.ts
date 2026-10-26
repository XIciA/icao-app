import type { QuestionBankId } from '@/features/question-bank/types';

export type RadioBankId = QuestionBankId;
export type RadioPlaybackMode = 'order' | 'repeatOne' | 'shuffle';
export type RadioSubtitleMode = 'english' | 'bilingual' | 'off';

export type RadioTrack = {
  id: string;
  bankId: RadioBankId;
  bankTitle: string;
  categoryId: string;
  categoryTitle: string;
  topicId: string;
  topicTitle: string;
  title: string;
  audioText: string;
  audioTextZh?: string;
  referenceText?: string;
  referenceTextZh?: string;
  referenceLabel?: string;
  materials?: { image: string; imageAlt: string }[];
  /** Directory entries are selectable before protected text/media is loaded. */
  contentLoaded?: boolean;
  requiresMembership?: boolean;
  audioPath: string;
  durationSeconds: number;
  stableIndex: number;
};

export type RadioCatalog = {
  bankId: RadioBankId;
  title: string;
  nameEn: string;
  tracks: RadioTrack[];
  /** False only when the server has not supplied a complete navigation index. */
  complete?: boolean;
};

export type RadioPlayerContextValue = {
  catalogs: RadioCatalog[];
  queueFilter?: import('./queue-filter').RadioQueueFilter;
  setQueueFilter?: (filter: import('./queue-filter').RadioQueueFilter) => void;
  currentCatalog?: RadioCatalog;
  currentTrack?: RadioTrack;
  currentIndex: number;
  mode: RadioPlaybackMode;
  subtitleMode: RadioSubtitleMode;
  rate: number;
  intervalSeconds: number;
  intervalRemaining: number;
  waitingForNext: boolean;
  speedOptions: readonly number[];
  playing: boolean;
  loading: boolean;
  buffering: boolean;
  /** Directory refresh never blocks the current audio controls. */
  catalogLoading?: boolean;
  catalogError?: string;
  retryCatalog?: () => void;
  error?: string;
  position: number;
  duration: number;
  sessionVisible: boolean;
  activateSession: () => void;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  seek: (position: number) => Promise<void>;
  next: (autoPlay?: boolean) => Promise<void>;
  previous: () => Promise<void>;
  selectBank: (bankId: RadioBankId) => void;
  selectTrack: (trackId: string, autoPlay?: boolean) => void;
  setMode: (mode: RadioPlaybackMode) => void;
  setSubtitleMode: (mode: RadioSubtitleMode) => void;
  setRate: (rate: number) => void;
  setIntervalSeconds: (seconds: number) => void;
  retry: () => void;
  stopAndClear: () => void;
};
