import type { EditorialArticle } from './index';
import type { AppContentHotspotBrief } from './app-content';
export type ContentOrderKind = 'opi' | 'article' | 'questions';
export type ContentAttachment = { id: string; name: string; mimeType: string; size: number; checksum: string };
export type ContentAttachmentInput = { name: string; data: string };
export type ContentOrderInput = { kind: ContentOrderKind; text: string; examDate?: string; center?: string; attachments?: ContentAttachmentInput[] };
export type ContentQuestionDecision = { source: string; kind: 'original' | 'similar' | 'new' | 'excluded' | 'unresolved'; cardId?: string; reason?: string };
export type ContentDraft = {
  banks: { bankId: string; baseChecksum: string; payload: Record<string, unknown> }[];
  hotspot?: AppContentHotspotBrief;
  /** Explicit replacement of existing historical briefs; never invents date/center identities. */
  hotspotUpdates?: { baseChecksum: string; briefs: AppContentHotspotBrief[] };
  article?: EditorialArticle;
  decisions: ContentQuestionDecision[];
  notes: string;
};
export type ContentOrder = {
  id: string; kind: ContentOrderKind; examDate: string | null; center: string | null; text: string;
  status: 'pending' | 'processing' | 'ready' | 'published'; revision: number; draft: ContentDraft | null;
  submittedBy: string | null; processingNote: string | null; attachments: ContentAttachment[];
  publishedRevision: number | null; createdAt: string; updatedAt: string;
};
export type ContentOrderSummary = Omit<ContentOrder, 'text' | 'draft' | 'attachments'> & { title: string };
