import type { FeedbackQuestionContext, FeedbackSubmissionPayload, OpsFeedbackQueueItem } from './index';

/** The release actually displayed in a study session, when known. */
export type VersionedFeedbackQuestionContext = FeedbackQuestionContext & {
  bankVersion?: number;
  bankChecksum?: string;
};
export type VersionedFeedbackSubmissionPayload = Omit<FeedbackSubmissionPayload, 'question'> & {
  question?: VersionedFeedbackQuestionContext;
};
export type OpsFeedbackListResponse = {
  items: OpsFeedbackQueueItem[];
  nextCursor: string | null;
};
export type OpsFeedbackAttachment = {
  id: string;
  mimeType: string;
  sizeBytes: number;
};
export type OpsFeedbackDetail = OpsFeedbackQueueItem & {
  description: string;
  contact: string | null;
  sourceRoute: string;
  appDisplayVersion: string;
  platform: string;
  osName: string | null;
  osVersion: string | null;
  question: (VersionedFeedbackQuestionContext & {
    verified: boolean;
    displayName?: string;
    displayNameSource?: 'submitted_release' | 'current_release';
  }) | null;
  attachments: OpsFeedbackAttachment[];
  replies?: FeedbackReply[];
};

export type FeedbackStatus = 'received' | 'processing' | 'resolved';
export type FeedbackReply = { id: string; text: string; createdAt: string };
export type MyFeedbackItem = {
  examDate?: string;
  examCenter?: string;
  source?: string;
  ticketNumber: string; category: string; description: string; status: string;
  createdAt: string; replies: FeedbackReply[]; unread: boolean;
};
export type MyFeedbackList = { items: MyFeedbackItem[]; nextCursor: string | null; unread: boolean };
export type MyFeedbackDetail = MyFeedbackItem & { attachments: Array<{ id: string; url: string }> };
