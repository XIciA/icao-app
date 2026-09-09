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
  question: (VersionedFeedbackQuestionContext & { verified: boolean }) | null;
  attachments: OpsFeedbackAttachment[];
};
