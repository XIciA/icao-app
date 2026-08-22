import { submitFeedback } from '../feedback-client';

const mockGetDiagnostics = jest.fn();
const mockClearDiagnostics = jest.fn();
const mockUploadFetch = jest.fn();
const mockForm = new FormData();

jest.mock('expo-device', () => ({ osName: 'iOS', osVersion: '19.0' }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { nativeBuildVersion: '42', expoConfig: { version: '1.0.0' } },
}));
jest.mock('@/platform/diagnostics/safe-diagnostic-store', () => ({
  getSafeDiagnosticBundleForCorrelation: (...args: unknown[]) => mockGetDiagnostics(...args),
  clearSafeDiagnosticCorrelation: (...args: unknown[]) => mockClearDiagnostics(...args),
}));
jest.mock('@/platform/feedback-upload', () => ({
  createFeedbackUploadForm: jest.fn(async () => ({ fetch: mockUploadFetch, form: mockForm })),
}));
jest.mock('@/platform/api-client', () => ({
  apiAccessToken: jest.fn(async () => 'access-token'),
  getApiBaseUrl: jest.fn(() => 'https://api.example.test'),
  getRecentApiError: jest.fn(() => ({ code: 'ai_timeout', requestId: 'req-1' })),
  recoverApiUnauthorized: jest.fn(async (response: Response) => response),
  rememberApiError: jest.fn((code: string) => new Error(code)),
}));

const diagnosticBundle = {
  schemaVersion: 1 as const,
  feature: 'ai' as const,
  correlationId: 'A-TEST-01',
  appVersion: 'v2026.08.12.0016',
  build: '42',
  platform: 'ios' as const,
  osVersion: '19.0',
  events: [{ offsetMs: 0, stage: 'api', code: 'ai_timeout', level: 'error' as const }],
};

describe('feedback diagnostics submission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDiagnostics.mockResolvedValue(diagnosticBundle);
  });

  it('clears the submitted correlation only after the ticket succeeds', async () => {
    mockUploadFetch.mockResolvedValue(new Response(JSON.stringify({
      requestId: 'feedback-request',
      data: { ticketNumber: 'FB-TEST', status: 'received', createdAt: '2026-08-14T00:00:00.000Z' },
    }), { status: 200 }));

    await expect(submitFeedback({
      clientSubmissionId: '00000000-0000-4000-8000-000000000123',
      category: 'other',
      description: 'AI 诊断反馈内容',
      diagnosticFeature: 'ai',
      diagnosticCorrelationId: 'A-TEST-01',
      source: 'profile',
      sourceRoute: '/profile',
      images: [],
    })).resolves.toMatchObject({ ticketNumber: 'FB-TEST' });
    expect(mockGetDiagnostics).toHaveBeenCalledWith(expect.objectContaining({ platform: 'ios' }), 'ai', 'A-TEST-01');
    expect(mockClearDiagnostics).toHaveBeenCalledWith('ai', 'A-TEST-01');
  });

  it('preserves the diagnostic correlation after a failed submission', async () => {
    mockUploadFetch.mockResolvedValue(new Response(JSON.stringify({
      requestId: 'feedback-request',
      error: { code: 'feedback_rate_limited', message: 'feedback_rate_limited' },
    }), { status: 429 }));

    await expect(submitFeedback({
      clientSubmissionId: '00000000-0000-4000-8000-000000000123',
      category: 'other',
      description: 'AI 诊断反馈内容',
      diagnosticFeature: 'ai',
      diagnosticCorrelationId: 'A-TEST-01',
      source: 'profile',
      sourceRoute: '/profile',
      images: [],
    })).rejects.toThrow('feedback_rate_limited');
    expect(mockClearDiagnostics).not.toHaveBeenCalled();
  });

  it('does not silently attach diagnostics to an ordinary feedback form', async () => {
    mockUploadFetch.mockResolvedValue(new Response(JSON.stringify({
      requestId: 'feedback-request',
      data: { ticketNumber: 'FB-GENERIC', status: 'received', createdAt: '2026-08-14T00:00:00.000Z' },
    }), { status: 200 }));

    await submitFeedback({
      clientSubmissionId: '00000000-0000-4000-8000-000000000123',
      category: 'feature_suggestion',
      description: '普通功能建议内容',
      source: 'profile',
      sourceRoute: '/profile',
      images: [],
    });

    expect(mockGetDiagnostics).not.toHaveBeenCalled();
    expect(mockClearDiagnostics).not.toHaveBeenCalled();
  });

  it('does not attach a feature-wide diagnostic without an exact correlation ID', async () => {
    mockUploadFetch.mockResolvedValue(new Response(JSON.stringify({
      requestId: 'feedback-request',
      data: { ticketNumber: 'FB-GENERIC', status: 'received', createdAt: '2026-08-14T00:00:00.000Z' },
    }), { status: 200 }));

    await submitFeedback({
      clientSubmissionId: '00000000-0000-4000-8000-000000000123',
      category: 'other',
      description: '只有功能类型但没有错误编号',
      diagnosticFeature: 'ai',
      source: 'profile',
      sourceRoute: '/profile',
      images: [],
    });

    expect(mockGetDiagnostics).not.toHaveBeenCalled();
    expect(mockClearDiagnostics).not.toHaveBeenCalled();
  });
});
