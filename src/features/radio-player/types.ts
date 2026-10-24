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
  audioPath: string;
  durationSeconds: number;
  stableIndex: number;
};

export type RadioCatalog = {
  bankId: RadioBankId;
  title: string;
  nameEn: string;
  tracks: RadioTrack[];
};

export type RadioPlayerContextValue = {
  catalogs: RadioCatalog[];
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
