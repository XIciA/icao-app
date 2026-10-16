import type { EditorialArticle } from './index';
import type { AppContentHotspotBrief } from './app-content';
export type ContentOrderKind = 'opi' | 'article' | 'questions';
export type ContentOrderInput = { kind: ContentOrderKind; text: string; examDate?: string; center?: string };
export type ContentQuestionDecision = { source: string; kind: 'original' | 'similar' | 'new' | 'excluded' | 'unresolved'; cardId?: string; reason?: string };
export type ContentDraft = {
  banks: { bankId: string; baseChecksum: string; payload: Record<string, unknown> }[];
  hotspot?: AppContentHotspotBrief;
  article?: EditorialArticle;
  decisions: ContentQuestionDecision[];
  notes: string;
};
export type ContentOrder = {
  id: string; kind: ContentOrderKind; examDate: string | null; center: string | null; text: string;
  status: 'pending' | 'ready' | 'published'; revision: number; draft: ContentDraft | null;
  publishedRevision: number | null; createdAt: string; updatedAt: string;
};
export type ContentOrderSummary = Omit<ContentOrder, 'text' | 'draft'>;
