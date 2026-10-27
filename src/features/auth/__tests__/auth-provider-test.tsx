import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiClientError, apiRequest, apiRequestWithAccessToken } from '@/platform/api-client';
import { AuthProvider, useAuth } from '../AuthProvider';
import type { AppSession } from '../auth-service';
import legalContent from '../../../../content/app-content/text.json';
import type { LoginLegalDocuments } from '../AuthProvider';

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockAuthorizePasswordRecovery = jest.fn();
const mockAuthorizeAccountDeletionWithPassword = jest.fn();
const mockAuthorizeAccountDeletionWithApple = jest.fn();
const mockAuthorizeAccountDeletionWithWechat = jest.fn();
const mockAuthorizeAccountDeletionWithPhoneOtp = jest.fn();
const mockRequestAccountDeletionPhoneOtp = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignOut = jest.fn();
const mockUpdatePassword = jest.fn();
const mockVerifyPhoneOtp = jest.fn();
const mockVerifyPhoneBindingOtp = jest.fn();
const mockVerifyCurrentAccountRecoveryOtp = jest.fn();
const mockGetLegalConsentStatus = jest.fn();
const mockAcceptLegalDocuments = jest.fn();
jest.mock('@/features/app-content/LegalConsentGate.native', () => ({ LegalConsentGate: () => null }));
jest.mock('../AccountRestoreState.native', () => ({ AccountRestoreState: () => <MockAuthStateProbe /> }));
jest.mock('@/features/app-content/legal-consent.native', () => ({
  getLegalConsentStatus: (...args: unknown[]) => mockGetLegalConsentStatus(...args),
  acceptLegalDocuments: (...args: unknown[]) => mockAcceptLegalDocuments(...args),
}));
let mockSessionChangeListener: ((session: AppSession | undefined, event: string) => void) | undefined;

jest.mock('../auth-service', () => ({
  getAuthService: () => ({
    getSession: (...args: unknown[]) => mockGetSession(...args),
    onSessionChange: (listener: (session: AppSession | undefined, event: string) => void) => {
      mockSessionChangeListener = listener;
      return () => { mockSessionChangeListener = undefined; };
    },
    refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
    authorizePasswordRecovery: (...args: unknown[]) => mockAuthorizePasswordRecovery(...args),
    authorizeAccountDeletionWithPassword: (...args: unknown[]) => mockAuthorizeAccountDeletionWithPassword(...args),
    authorizeAccountDeletionWithApple: (...args: unknown[]) => mockAuthorizeAccountDeletionWithApple(...args),
    authorizeAccountDeletionWithWechat: (...args: unknown[]) => mockAuthorizeAccountDeletionWithWechat(...args),
    authorizeAccountDeletionWithPhoneOtp: (...args: unknown[]) => mockAuthorizeAccountDeletionWithPhoneOtp(...args),
    requestAccountDeletionPhoneOtp: (...args: unknown[]) => mockRequestAccountDeletionPhoneOtp(...args),
    signInWithApple: (...args: unknown[]) => mockSignInWithApple(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
    updatePassword: (...args: unknown[]) => mockUpdatePassword(...args),
    verifyPhoneOtp: (...args: unknown[]) => mockVerifyPhoneOtp(...args),
    verifyPhoneBindingOtp: (...args: unknown[]) => mockVerifyPhoneBindingOtp(...args),
    verifyCurrentAccountRecoveryOtp: (...args: unknown[]) => mockVerifyCurrentAccountRecoveryOtp(...args),
  }),
}));

jest.mock('@/platform/api-client', () => {
  class MockApiClientError extends Error {
    readonly code: string;
    readonly status: number;
    readonly requestId?: string;

    constructor(mockCode: string, mockStatus: number, mockRequestId?: string) {
      super(mockCode);
      this.code = mockCode;
      this.status = mockStatus;
      this.requestId = mockRequestId;
    }
  }
  return {
    ApiClientError: MockApiClientError,
    apiFetch: jest.fn(),
    apiRequest: jest.fn(),
    apiRequestWithAccessToken: jest.fn((path: string, _token: string, init: object) => mockApiRequest(path, init)),
    setApiAccessTokenProvider: jest.fn(),
    setApiAuthRecovery: jest.fn(),
  };
});

jest.mock('@/features/ai/ai-client', () => ({ clearLocalAiConsent: jest.fn().mockResolvedValue(undefined) }));

const mockClearDeletedAccountLocalData = jest.fn();
jest.mock('../account-deletion-local-cleanup', () => ({
  clearDeletedAccountLocalData: (...args: unknown[]) => mockClearDeletedAccountLocalData(...args),
}));

const mockClearPendingAccountDeletion = jest.fn();
const mockPendingAccountDeletionFor = jest.fn();
const mockReadPendingAccountDeletion = jest.fn();
jest.mock('../account-deletion-state', () => ({
  clearPendingAccountDeletion: (...args: unknown[]) => mockClearPendingAccountDeletion(...args),
  pendingAccountDeletionFor: (...args: unknown[]) => mockPendingAccountDeletionFor(...args),
  readPendingAccountDeletion: (...args: unknown[]) => mockReadPendingAccountDeletion(...args),
}));

const mockSwitchLearningAccount = jest.fn();
jest.mock('@/features/sync/learning-sync.native', () => ({
  switchLearningSyncAccount: (...args: unknown[]) => mockSwitchLearningAccount(...args),
  archiveAndBindEmptyLearningSync: jest.fn(),
  bindEmptyLearningSync: jest.fn().mockResolvedValue(undefined),
  bindLearningSync: jest.fn(),
  clearPersonalLearningData: jest.fn(),
  inspectLearningSyncBinding: jest.fn().mockResolvedValue({ needsConfirmation: false }),
  runLearningSync: jest.fn(),
  setLearningSyncActiveUser: jest.fn(),
}));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const socialSession: AppSession = {
  accessToken: 'apple-access-token',
  refreshToken: 'apple-refresh-token',
  user: {
    authUserId: 'apple-auth-user',
    hasPassword: false,
    id: 'apple-auth-user',
    phoneBound: false,
    providers: ['apple'],
    registrationPending: false,
  },
};

const phoneSession: AppSession = {
  accessToken: 'phone-access-token',
  refreshToken: 'phone-refresh-token',
  user: {
    authUserId: 'phone-auth-user',
    hasPassword: true,
    id: 'phone-auth-user',
    phone: '+8613800138000',
    phoneBound: true,
    providers: ['phone'],
    registrationPending: false,
  },
};

const phoneChallenge = {
  challengeId: '10000000-0000-4000-8000-000000000020',
  expiresAt: Date.now() + 300_000,
  issuedAt: Date.now(),
  phone: '+8613800138000',
  purpose: 'login' as const,
  resendAllowedAt: Date.now() + 60_000,
  serverTimeOffsetMs: 0,
  version: 2 as const,
};
const recoveryChallenge = { ...phoneChallenge, purpose: 'recovery' as const };

let currentAuth: ReturnType<typeof useAuth>;

function MockAuthStateProbe() {
  currentAuth = useAuth();
  return (
    <Text testID="auth-state">
      {currentAuth.restoring ? 'restoring' : currentAuth.canAccessApp ? 'ready' : 'closed'}
    </Text>
  );
}

describe('<AuthProvider /> internal-account gate', () => {
  beforeEach(() => {
    mockSessionChangeListener = undefined;
    mockSwitchLearningAccount.mockReset().mockResolvedValue(undefined);
    mockApiRequest.mockReset();
    (apiRequestWithAccessToken as jest.Mock).mockClear();
    mockGetSession.mockReset().mockResolvedValue(undefined);
    mockRefreshSession.mockReset().mockResolvedValue(undefined);
    mockAuthorizePasswordRecovery.mockReset().mockResolvedValue({
      authorized: true,
      expiresAt: Date.now() + 600_000,
      grantId: '10000000-0000-4000-8000-000000000001',
    });
    mockAuthorizeAccountDeletionWithPassword.mockReset().mockResolvedValue({
      expiresAt: Date.now() + 300_000,
      grantId: '10000000-0000-4000-8000-000000000010',
      method: 'password',
      purpose: 'account_delete',
    });
    mockAuthorizeAccountDeletionWithApple.mockReset();
    mockAuthorizeAccountDeletionWithWechat.mockReset();
    mockAuthorizeAccountDeletionWithPhoneOtp.mockReset();
    mockRequestAccountDeletionPhoneOtp.mockReset();
    mockClearDeletedAccountLocalData.mockReset().mockResolvedValue(undefined);
    mockClearPendingAccountDeletion.mockReset().mockResolvedValue(undefined);
    mockPendingAccountDeletionFor.mockReset().mockResolvedValue({
      accountId: 'phone-auth-user',
      createdAt: 1,
      idempotencyKey: '10000000-0000-4000-8000-000000000011',
    });
    mockReadPendingAccountDeletion.mockReset().mockResolvedValue(undefined);
    mockSignInWithApple.mockReset().mockResolvedValue(socialSession);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockUpdatePassword.mockReset().mockResolvedValue(phoneSession);
    mockVerifyPhoneOtp.mockReset().mockResolvedValue(phoneSession);
    mockVerifyPhoneBindingOtp.mockReset();
    mockVerifyCurrentAccountRecoveryOtp.mockReset();
    mockGetLegalConsentStatus.mockReset().mockImplementation(async (accountId: string) => ({ accountId, required: false, receipt: null }));
    mockAcceptLegalDocuments.mockReset();
  });

  it.each(['password', 'binding', 'recovery'] as const)('ignores a late %s response after the user signs into another account', async (operation) => {
    mockGetSession.mockResolvedValue(phoneSession);
    const original = { accountId: 'account-A', phone: phoneSession.user.phone, phoneBound: true, hasPassword: true, providers: ['phone'] };
    mockApiRequest.mockResolvedValueOnce(original).mockResolvedValue({ accountId: 'account-B', phoneBound: false, providers: ['apple'] });
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.canAccessApp).toBe(true));
    let resolve!: (value: unknown) => void;
    const deferred = new Promise((done) => { resolve = done; });
    const method = operation === 'password' ? mockUpdatePassword : operation === 'binding' ? mockVerifyPhoneBindingOtp : mockVerifyCurrentAccountRecoveryOtp;
    method.mockReturnValueOnce(deferred);
    let pending!: Promise<void>;
    await act(async () => {
      pending = operation === 'password' ? currentAuth.updatePassword('newpassword10', 'oldpassword10')
        : operation === 'binding' ? currentAuth.verifyPhoneBindingOtp(phoneChallenge, '123456')
        : currentAuth.verifyCurrentAccountRecoveryOtp(recoveryChallenge, '123456');
    });
    await act(async () => { await currentAuth.signOut(); });
    await act(async () => { await currentAuth.signInWithApple(); });
    await act(async () => {
      resolve(operation === 'password' ? phoneSession : operation === 'binding' ? { session: phoneSession, account: original }
        : { session: phoneSession, authorization: { grantId: 'old-grant', expiresAt: Date.now() + 10000 } });
      await expect(pending).rejects.toThrow('auth_request_not_completed');
    });
    expect(currentAuth.account?.accountId).toBe('account-B');
    expect(currentAuth.session?.user.id).toBe(socialSession.user.id);
    expect(currentAuth.canAccessApp).toBe(true);
    expect(currentAuth.passwordChangePurpose).toBeUndefined();
  });

  it.each(['verification', 'request'] as const)('does not clear a new account after a late revoke-all %s response', async phase => {
    mockGetSession.mockResolvedValue(phoneSession);
    mockApiRequest.mockImplementation(async path => path === '/v1/account'
      ? { accountId: 'account-A', phoneBound: true, providers: ['phone'] } : { revoked: true });
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.canAccessApp).toBe(true));
    let resolve!: (value: unknown) => void;
    const deferred = new Promise(done => { resolve = done; });
    if (phase === 'verification') mockAuthorizeAccountDeletionWithPassword.mockReturnValueOnce(deferred);
    else mockApiRequest.mockImplementationOnce(() => deferred as never);
    let pending!: Promise<void>;
    await act(async () => { pending = currentAuth.signOutAll({ method: 'password', password: 'password10' }); });
    await act(async () => { await currentAuth.signOut(); });
    mockApiRequest.mockResolvedValue({ accountId: 'account-B', phoneBound: false, providers: ['apple'] });
    await act(async () => { await currentAuth.signInWithApple(); });
    const signOutCount = mockSignOut.mock.calls.length;
    await act(async () => {
      resolve(phase === 'verification' ? { grantId: 'late-grant' } : { revoked: true });
      await expect(pending).rejects.toThrow('auth_request_not_completed');
    });
    expect(mockSignOut).toHaveBeenCalledTimes(signOutCount);
    expect(currentAuth.account?.accountId).toBe('account-B');
    expect(currentAuth.canAccessApp).toBe(true);
  });

  it('ignores an old session inspection error after a new login succeeds', async () => {
    mockGetSession.mockResolvedValue(phoneSession);
    mockApiRequest.mockResolvedValueOnce({ accountId: 'account-A', phoneBound: true, providers: ['phone'] })
      .mockResolvedValue({ accountId: 'account-B', phoneBound: false, providers: ['apple'] });
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.canAccessApp).toBe(true));
    let reject!: (error: Error) => void;
    mockGetSession.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    await act(async () => { mockSessionChangeListener?.(phoneSession, 'TOKEN_REFRESHED'); });
    await act(async () => { await currentAuth.signInWithApple(); });
    await act(async () => { reject(new Error('old-storage-read-failed')); await Promise.resolve(); });
    expect(currentAuth.account?.accountId).toBe('account-B');
    expect(currentAuth.accountRestoreUnavailable).toBe(false);
    expect(currentAuth.canAccessApp).toBe(true);
  });

  it('keeps the same business account and learning workspace open after a verified phone binding', async () => {
    mockGetSession.mockResolvedValue(socialSession);
    const original = { accountId: 'account-A', phoneBound: false, providers: ['apple'] };
    mockApiRequest.mockResolvedValueOnce(original);
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.canAccessApp).toBe(true));
    mockVerifyPhoneBindingOtp.mockResolvedValueOnce({ session: phoneSession,
      account: { ...original, phone: phoneSession.user.phone, phoneBound: true, providers: ['apple', 'phone'] } });
    await act(async () => { await currentAuth.verifyPhoneBindingOtp(phoneChallenge, '123456'); });
    expect(currentAuth.canAccessApp).toBe(true);
    expect(currentAuth.account?.accountId).toBe('account-A');
    expect(currentAuth.session?.user.id).toBe(phoneSession.user.id);
    expect(mockSwitchLearningAccount).toHaveBeenCalledTimes(1);
    expect(mockGetLegalConsentStatus).toHaveBeenCalledTimes(1);
  });

  it('does not open business screens until the permanent account is initialized', async () => {
    let resolveAccount!: (value: unknown) => void;
    mockApiRequest.mockImplementationOnce(() => new Promise((resolve) => { resolveAccount = resolve; }));
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    let login!: Promise<void>;
    await act(async () => {
      login = currentAuth.signInWithApple();
      await Promise.resolve();
    });
    expect(screen.getByTestId('auth-state').props.children).toBe('closed');

    await act(async () => {
      resolveAccount({ accountId: 'account-1', phoneBound: false, providers: ['apple'] });
      await login;
    });
    expect(screen.getByTestId('auth-state').props.children).toBe('ready');
  });

  it('keeps business data closed until the account workspace is ready, without an import prompt', async () => {
    let finishSwitch!: () => void;
    mockSwitchLearningAccount.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSwitch = resolve; }));
    mockApiRequest.mockResolvedValueOnce({ accountId: 'account-1', phoneBound: false, providers: ['apple'] });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    let login!: Promise<void>;
    await act(async () => { login = currentAuth.signInWithApple(); await Promise.resolve(); });
    await waitFor(() => expect(mockSwitchLearningAccount).toHaveBeenCalledWith('account-1'));
    expect(currentAuth.canAccessApp).toBe(false);
    expect(screen.queryByText('导入当前账号并同步')).toBeNull();
    await act(async () => { finishSwitch(); await login; });
    expect(currentAuth.canAccessApp).toBe(true);
  });

  it('keeps a workspace failure closed and permits restoring the verified session again', async () => {
    mockApiRequest.mockResolvedValue({ accountId: 'account-1', phoneBound: false, providers: ['apple'] });
    mockSwitchLearningAccount.mockRejectedValueOnce(new Error('disk_unavailable'));
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    await act(async () => { await expect(currentAuth.signInWithApple()).rejects.toThrow('auth_service_unavailable'); });
    expect(currentAuth.canAccessApp).toBe(false);
    expect(currentAuth.accountRestoreUnavailable).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();
    // Successful authentication persisted this session before workspace setup failed.
    mockGetSession.mockResolvedValue(socialSession);
    await act(async () => { await currentAuth.retryAccountRestore(); });
    expect(currentAuth.canAccessApp).toBe(true);
  });

  it('keeps first access closed until the exact displayed legal versions are accepted', async () => {
    const documents = legalContent.legal as LoginLegalDocuments;
    mockApiRequest.mockResolvedValue({ accountId: 'account-1', phoneBound: false, providers: ['apple'] });
    mockGetLegalConsentStatus.mockResolvedValue({ accountId: 'account-1', required: true, receipt: null, ...documents });
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    await act(async () => { await currentAuth.signInWithApple(); });
    expect(currentAuth.accountReady).toBe(true);
    expect(currentAuth.canAccessApp).toBe(false);
    expect(mockAcceptLegalDocuments).not.toHaveBeenCalled();
  });

  it('records login consent once and enters without asking for the same versions again', async () => {
    const documents = legalContent.legal as LoginLegalDocuments;
    mockApiRequest.mockResolvedValue({ accountId: 'account-1', phoneBound: false, providers: ['apple'] });
    mockGetLegalConsentStatus.mockResolvedValue({ accountId: 'account-1', required: true, receipt: null, ...documents });
    mockAcceptLegalDocuments.mockResolvedValue({ accountId: 'account-1' });
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    await act(async () => {
      currentAuth.rememberLoginConsent(documents);
      await currentAuth.signInWithApple();
    });
    expect(mockAcceptLegalDocuments).toHaveBeenCalledTimes(1);
    expect(mockAcceptLegalDocuments).toHaveBeenCalledWith('account-1', documents);
    expect(currentAuth.canAccessApp).toBe(true);
  });

  it('does not silently accept a newer policy published while login is in progress', async () => {
    const documents = legalContent.legal as LoginLegalDocuments;
    mockApiRequest.mockResolvedValue({ accountId: 'account-1', phoneBound: false, providers: ['apple'] });
    mockGetLegalConsentStatus.mockResolvedValue({ accountId: 'account-1', required: true, receipt: null, ...documents,
      privacy: { ...documents.privacy, version: 'next-version' } });
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    await act(async () => {
      currentAuth.rememberLoginConsent(documents);
      await currentAuth.signInWithApple();
    });
    expect(mockAcceptLegalDocuments).not.toHaveBeenCalled();
    expect(currentAuth.canAccessApp).toBe(false);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('preserves the verified session while a consent receipt write needs retry', async () => {
    const documents = legalContent.legal as LoginLegalDocuments;
    mockApiRequest.mockResolvedValue({ accountId: 'account-1', phoneBound: false, providers: ['apple'] });
    mockGetLegalConsentStatus.mockResolvedValue({ accountId: 'account-1', required: true, receipt: null, ...documents });
    mockAcceptLegalDocuments.mockRejectedValue(new Error('offline'));
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    await act(async () => {
      currentAuth.rememberLoginConsent(documents);
      await currentAuth.signInWithApple();
    });
    expect(currentAuth.canAccessApp).toBe(false);
    expect(currentAuth.accountRestoreUnavailable).toBe(false);
    expect(currentAuth.session).toEqual(socialSession);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('does not let a stale startup restore clear a newer OTP login', async () => {
    let resolveStartupSession!: (value: AppSession | undefined) => void;
    mockGetSession.mockImplementationOnce(() => new Promise((resolve) => { resolveStartupSession = resolve; }));
    mockApiRequest.mockResolvedValueOnce({
      accountId: 'phone-auth-user',
      phone: '+8613800138000',
      phoneBound: true,
      providers: ['phone'],
    });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);

    await act(async () => {
      await currentAuth.verifyPhoneOtp(phoneChallenge, '123456');
    });
    expect(currentAuth.canAccessApp).toBe(true);

    await act(async () => {
      resolveStartupSession(undefined);
      await Promise.resolve();
    });

    expect(screen.getByTestId('auth-state').props.children).toBe('ready');
    expect(currentAuth.session?.user.id).toBe('phone-auth-user');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('ignores a delayed Supabase INITIAL_SESSION event after OTP login', async () => {
    mockApiRequest.mockResolvedValueOnce({
      accountId: 'phone-auth-user',
      phone: '+8613800138000',
      phoneBound: true,
      providers: ['phone'],
    });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));

    await act(async () => {
      await currentAuth.verifyPhoneOtp(phoneChallenge, '123456');
      mockSessionChangeListener?.(undefined, 'INITIAL_SESSION');
    });

    expect(screen.getByTestId('auth-state').props.children).toBe('ready');
    expect(currentAuth.session?.user.id).toBe('phone-auth-user');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('resumes a completed deletion before restoring any persisted login session', async () => {
    mockReadPendingAccountDeletion.mockResolvedValueOnce({
      accountId: 'account-deleting',
      createdAt: 1,
      idempotencyKey: '10000000-0000-4000-8000-000000000011',
    });
    mockApiRequest.mockResolvedValueOnce({
      identityProviderOutcome: 'revoked',
      jobId: '10000000-0000-4000-8000-000000000012',
      status: 'completed',
    });

    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/deletion/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: '10000000-0000-4000-8000-000000000011' }),
    });
    expect(mockClearDeletedAccountLocalData).toHaveBeenCalledTimes(1);
    expect(mockClearDeletedAccountLocalData).toHaveBeenCalledWith('account-deleting');
    expect(mockClearPendingAccountDeletion).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith('local');
  });

  it('rejects an explicit retry when secure storage is still unavailable, then permits recovery', async () => {
    mockReadPendingAccountDeletion.mockRejectedValueOnce(new Error('secure_storage_unavailable')).mockRejectedValueOnce(new Error('secure_storage_unavailable'));
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    await act(async () => { await expect(currentAuth.retryAccountRestore()).rejects.toThrow('account_restore_unavailable'); });
    expect(currentAuth.accountRestoreUnavailable).toBe(true);
    await act(async () => { await currentAuth.retryAccountRestore(); });
    expect(currentAuth.accountRestoreUnavailable).toBe(false);
  });

  it('reports secure-store startup failures without claiming that account deletion is in progress', async () => {
    mockReadPendingAccountDeletion.mockRejectedValueOnce(new Error('secure_storage_unavailable'));

    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));

    expect(screen.getByTestId('auth-state').props.children).toBe('closed');
    expect(currentAuth.accountDeletionPending).toBe(false);
    expect(currentAuth.accountRestoreUnavailable).toBe(true);
    expect(mockGetSession).not.toHaveBeenCalled();

    await act(async () => { await currentAuth.retryAccountRestore(); });

    expect(currentAuth.accountRestoreUnavailable).toBe(false);
    expect(currentAuth.accountDeletionPending).toBe(false);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('reports a temporary deletion-status outage as unavailable without discarding the receipt', async () => {
    mockReadPendingAccountDeletion.mockResolvedValueOnce({
      accountId: 'account-deleting',
      createdAt: 1,
      idempotencyKey: '10000000-0000-4000-8000-000000000011',
    });
    mockApiRequest.mockRejectedValueOnce(new Error('network_temporarily_unavailable'));

    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));

    expect(screen.getByTestId('auth-state').props.children).toBe('closed');
    expect(currentAuth.accountDeletionPending).toBe(false);
    expect(currentAuth.accountRestoreUnavailable).toBe(true);
    expect(mockClearPendingAccountDeletion).not.toHaveBeenCalled();
    expect(mockClearDeletedAccountLocalData).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('retains the deletion receipt and retries completed cleanup when local sign-out fails', async () => {
    mockReadPendingAccountDeletion.mockResolvedValue({
      accountId: 'account-deleting',
      createdAt: 1,
      idempotencyKey: '10000000-0000-4000-8000-000000000011',
    });
    mockApiRequest.mockResolvedValue({
      identityProviderOutcome: 'revoked',
      jobId: '10000000-0000-4000-8000-000000000012',
      status: 'completed',
    });
    mockSignOut.mockRejectedValueOnce(new Error('secure_storage_unavailable'));

    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    expect(screen.getByTestId('auth-state').props.children).toBe('closed');
    expect(currentAuth.accountDeletionPending).toBe(true);
    expect(mockClearPendingAccountDeletion).not.toHaveBeenCalled();

    await act(async () => { await currentAuth.resumeAccountDeletion(); });

    expect(mockClearDeletedAccountLocalData).toHaveBeenCalledTimes(2);
    expect(mockSignOut).toHaveBeenCalledTimes(2);
    expect(mockClearPendingAccountDeletion).toHaveBeenCalledTimes(1);
    expect(currentAuth.accountDeletionPending).toBe(false);
  });

  it('blocks session restoration while a persisted deletion is still processing', async () => {
    mockReadPendingAccountDeletion.mockResolvedValue({
      accountId: 'account-deleting',
      createdAt: 1,
      idempotencyKey: '10000000-0000-4000-8000-000000000011',
    });
    mockApiRequest.mockResolvedValueOnce({
      identityProviderOutcome: 'pending',
      jobId: '10000000-0000-4000-8000-000000000012',
      status: 'retryable',
    });

    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.accountDeletionPending).toBe(true));

    expect(screen.getByTestId('auth-state').props.children).toBe('closed');
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockClearDeletedAccountLocalData).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('preserves a verified session behind the restore gate when account initialization fails', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('api_http_503'));
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    let failure: unknown;
    await act(async () => {
      try {
        await currentAuth.signInWithApple();
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toEqual(expect.objectContaining({ message: 'auth_service_unavailable' }));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(currentAuth.session?.user.id).toBe('apple-auth-user');
    expect(currentAuth.accountRestoreUnavailable).toBe(true);
    expect(screen.getByTestId('auth-state').props.children).toBe('closed');
  });

  it('retains and retries a persisted session when cold-start account bootstrap is temporarily unavailable', async () => {
    mockGetSession.mockResolvedValueOnce(phoneSession).mockResolvedValueOnce(phoneSession);
    mockApiRequest
      .mockRejectedValueOnce(new Error('api_http_503'))
      .mockResolvedValueOnce({
        accountId: 'phone-auth-user',
        phone: '+8613800138000',
        phoneBound: true,
        providers: ['phone'],
      });

    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));

    expect(currentAuth.session?.user.id).toBe('phone-auth-user');
    expect(currentAuth.accountRestoreUnavailable).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();

    await act(async () => { await currentAuth.retryAccountRestore(); });

    expect(currentAuth.accountRestoreUnavailable).toBe(false);
    expect(currentAuth.account?.accountId).toBe('phone-auth-user');
    expect(screen.getByTestId('auth-state').props.children).toBe('ready');
  });

  it('re-reads a refreshed session before retrying a failed cold-start bootstrap', async () => {
    const refreshed = { ...phoneSession, accessToken: 'refreshed-phone-access-token' };
    mockGetSession.mockResolvedValueOnce(phoneSession).mockResolvedValueOnce(refreshed);
    mockApiRequest.mockRejectedValueOnce(new ApiClientError('api_http_503', 503))
      .mockResolvedValueOnce({ accountId: 'phone-auth-user', providers: ['phone'] });
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    expect(currentAuth.accountRestoreUnavailable).toBe(true);

    await act(async () => { await currentAuth.retryAccountRestore(); });

    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(apiRequestWithAccessToken).toHaveBeenNthCalledWith(2, '/v1/account', refreshed.accessToken);
    expect(currentAuth.session?.accessToken).toBe(refreshed.accessToken);
    expect(currentAuth.canAccessApp).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('returns to login when the persisted session became invalid after a bootstrap failure', async () => {
    mockGetSession.mockResolvedValueOnce(phoneSession).mockResolvedValueOnce(undefined);
    mockApiRequest.mockRejectedValueOnce(new ApiClientError('api_http_503', 503));
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    expect(currentAuth.accountRestoreUnavailable).toBe(true);

    await act(async () => { await currentAuth.retryAccountRestore(); });

    expect(currentAuth.session).toBeUndefined();
    expect(currentAuth.accountRestoreUnavailable).toBe(false);
    expect(currentAuth.canAccessApp).toBe(false);
    expect(apiRequestWithAccessToken).toHaveBeenCalledTimes(1);
    expect(mockClearDeletedAccountLocalData).not.toHaveBeenCalled();
  });

  it('authorizes a verified recovery OTP and adopts the password update session without refreshing the old token', async () => {
    mockApiRequest.mockResolvedValueOnce({
      accountId: 'phone-auth-user',
      phone: '+8613800138000',
      phoneBound: true,
      providers: ['phone'],
    });
    const nextSession: AppSession = {
      ...phoneSession,
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token',
    };
    mockUpdatePassword.mockResolvedValueOnce(nextSession);
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp(recoveryChallenge, '123456');
    });
    expect(mockAuthorizePasswordRecovery).toHaveBeenCalledTimes(1);
    expect(mockAuthorizePasswordRecovery).toHaveBeenCalledWith(
      recoveryChallenge.challengeId,
      phoneSession.accessToken,
    );
    expect(currentAuth.passwordChangePurpose).toBe('recovery');
    let recoveryPath: string | undefined;
    await act(async () => { recoveryPath = currentAuth.consumePendingPath(); });
    expect(recoveryPath).toBe('/account/password?mode=recovery');

    await act(async () => {
      await currentAuth.updatePassword('newpassword10');
    });
    expect(mockUpdatePassword).toHaveBeenCalledWith(
      'newpassword10',
      undefined,
      '10000000-0000-4000-8000-000000000001',
    );
    expect(currentAuth.session?.accessToken).toBe('next-access-token');
    expect(currentAuth.passwordChangePurpose).toBeUndefined();
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('clears the OTP session when the server refuses the recovery authorization', async () => {
    mockAuthorizePasswordRecovery.mockRejectedValueOnce(new Error('phone_reauthentication_required'));
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    let failure: unknown;
    await act(async () => {
      try {
        await currentAuth.verifyPhoneOtp(recoveryChallenge, '123456');
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toEqual(expect.objectContaining({ message: 'phone_reauthentication_required' }));
    expect(mockSignOut).toHaveBeenCalledWith('local');
    expect(currentAuth.session).toBeUndefined();
    expect(currentAuth.passwordChangePurpose).toBeUndefined();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('does not submit an expired password recovery grant', async () => {
    mockAuthorizePasswordRecovery.mockResolvedValueOnce({
      authorized: true,
      expiresAt: Date.now() - 1,
      grantId: '10000000-0000-4000-8000-000000000001',
    });
    mockApiRequest.mockResolvedValueOnce({
      accountId: 'phone-auth-user',
      phone: '+8613800138000',
      phoneBound: true,
      providers: ['phone'],
    });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp(recoveryChallenge, '123456');
    });
    let failure: unknown;
    await act(async () => {
      try {
        await currentAuth.updatePassword('newpassword10');
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toEqual(expect.objectContaining({ message: 'phone_reauthentication_required' }));
    expect(mockUpdatePassword).not.toHaveBeenCalled();
    expect(currentAuth.passwordChangePurpose).toBeUndefined();
  });

  it('invalidates a recovery grant when the authenticated session changes', async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        accountId: 'phone-auth-user',
        phone: '+8613800138000',
        phoneBound: true,
        providers: ['phone'],
      })
      .mockResolvedValueOnce({
        accountId: 'apple-auth-user',
        phoneBound: false,
        providers: ['apple'],
      });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp(recoveryChallenge, '123456');
      await currentAuth.signInWithApple();
    });

    let failure: unknown;
    await act(async () => {
      try {
        await currentAuth.updatePassword('newpassword10');
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toEqual(expect.objectContaining({ message: 'phone_reauthentication_required' }));
    expect(mockUpdatePassword).not.toHaveBeenCalled();
    expect(currentAuth.passwordChangePurpose).toBeUndefined();
  });

  it('consumes the recovery grant locally before the first password update attempt', async () => {
    mockUpdatePassword.mockRejectedValueOnce(new Error('auth_service_unavailable'));
    mockApiRequest.mockResolvedValueOnce({
      accountId: 'phone-auth-user',
      phone: '+8613800138000',
      phoneBound: true,
      providers: ['phone'],
    });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp(recoveryChallenge, '123456');
    });
    let firstFailure: unknown;
    await act(async () => {
      try {
        await currentAuth.updatePassword('newpassword10');
      } catch (error) {
        firstFailure = error;
      }
    });
    expect(firstFailure).toEqual(expect.objectContaining({ message: 'auth_service_unavailable' }));

    let replayFailure: unknown;
    await act(async () => {
      try {
        await currentAuth.updatePassword('newpassword10');
      } catch (error) {
        replayFailure = error;
      }
    });
    expect(replayFailure).toEqual(expect.objectContaining({ message: 'phone_reauthentication_required' }));

    expect(mockUpdatePassword).toHaveBeenCalledTimes(1);
    expect(mockUpdatePassword).toHaveBeenCalledWith(
      'newpassword10',
      undefined,
      '10000000-0000-4000-8000-000000000001',
    );
    expect(currentAuth.passwordChangePurpose).toBeUndefined();
  });

  it('submits a recently authenticated idempotent deletion and clears local data only after completion', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ accountId: 'phone-auth-user', phone: '+8613800138000', phoneBound: true, providers: ['phone'] })
      .mockResolvedValueOnce({
        identityProviderOutcome: 'not_applicable',
        jobId: '10000000-0000-4000-8000-000000000012',
        status: 'completed',
      });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp(phoneChallenge, '123456');
    });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));
    await act(async () => {
      await currentAuth.deleteAccount({ method: 'password', password: 'password10' });
    });

    expect(mockAuthorizeAccountDeletionWithPassword).toHaveBeenCalledWith('password10');
    expect(mockApiRequest).toHaveBeenLastCalledWith('/v1/account', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        confirmation: '注销账号',
        grantId: '10000000-0000-4000-8000-000000000010',
        idempotencyKey: '10000000-0000-4000-8000-000000000011',
      }),
    });
    expect(mockClearDeletedAccountLocalData).toHaveBeenCalledTimes(1);
    expect(mockClearPendingAccountDeletion).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith('local');
    expect(currentAuth.accountDeletionPending).toBe(false);
  });

  it('does not create a deletion job when the final confirmation is cancelled after verification', async () => {
    mockApiRequest.mockResolvedValueOnce({ accountId: 'phone-auth-user', phoneBound: true, providers: ['phone'] });
    await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));
    await act(async () => { await currentAuth.verifyPhoneOtp(phoneChallenge, '123456'); });
    const confirm = jest.fn(async () => {
      expect(mockAuthorizeAccountDeletionWithPassword).toHaveBeenCalledWith('password10');
      return false;
    });
    await act(async () => {
      await expect(currentAuth.deleteAccount({ method: 'password', password: 'password10' }, confirm))
        .rejects.toThrow('account_deletion_cancelled');
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mockPendingAccountDeletionFor).not.toHaveBeenCalled();
    expect(mockClearDeletedAccountLocalData).not.toHaveBeenCalled();
    expect(currentAuth.canAccessApp).toBe(true);
  });

  it('honors the explicitly selected password method on a multi-identity Apple session', async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        accountId: 'account-multi',
        hasPassword: true,
        phone: '+8613800138000',
        phoneBound: true,
        providers: ['phone', 'apple'],
      })
      .mockResolvedValueOnce({
        identityProviderOutcome: 'not_applicable',
        jobId: '10000000-0000-4000-8000-000000000012',
        status: 'completed',
      });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => { await currentAuth.signInWithApple(); });
    await act(async () => {
      await currentAuth.deleteAccount({ method: 'password', password: 'password10' });
    });

    expect(mockAuthorizeAccountDeletionWithPassword).toHaveBeenCalledWith('password10');
    expect(mockAuthorizeAccountDeletionWithApple).not.toHaveBeenCalled();
    expect(mockAuthorizeAccountDeletionWithPhoneOtp).not.toHaveBeenCalled();
  });

  it('requires and forwards a dedicated recent-auth grant before signing out every device', async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        accountId: 'phone-auth-user',
        hasPassword: true,
        phone: '+8613800138000',
        phoneBound: true,
        providers: ['phone'],
      })
      .mockResolvedValueOnce({ revoked: true });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => { await currentAuth.verifyPhoneOtp(phoneChallenge, '123456'); });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));
    await act(async () => {
      await currentAuth.signOutAll({ method: 'password', password: 'password10' });
    });

    expect(mockAuthorizeAccountDeletionWithPassword).toHaveBeenCalledWith(
      'password10',
      'session_revoke_all',
    );
    expect(mockApiRequest).toHaveBeenLastCalledWith('/v1/account/sessions/revoke-all', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grantId: '10000000-0000-4000-8000-000000000010' }),
    });
    expect(mockSignOut).toHaveBeenCalledWith('local');
    expect(currentAuth.session).toBeUndefined();
  });

  it('blocks the app and preserves local data while an accepted deletion is still processing', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ accountId: 'phone-auth-user', phone: '+8613800138000', phoneBound: true, providers: ['phone'] })
      .mockResolvedValueOnce({
        identityProviderOutcome: 'pending',
        jobId: '10000000-0000-4000-8000-000000000012',
        status: 'retryable',
      });
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp(phoneChallenge, '123456');
    });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));
    await act(async () => {
      await currentAuth.deleteAccount({ method: 'password', password: 'password10' });
    });

    expect(currentAuth.accountDeletionPending).toBe(true);
    expect(currentAuth.session).toBeUndefined();
    expect(mockClearDeletedAccountLocalData).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalledWith('local');
  });

  it('keeps the app closed and reports an unavailable account state when the DELETE response and status check are lost', async () => {
    const pending = {
      accountId: 'phone-auth-user',
      createdAt: Date.now(),
      idempotencyKey: '10000000-0000-4000-8000-000000000011',
    };
    mockReadPendingAccountDeletion.mockResolvedValueOnce(undefined).mockResolvedValue(pending);
    mockApiRequest
      .mockResolvedValueOnce({ accountId: 'phone-auth-user', phone: '+8613800138000', phoneBound: true, providers: ['phone'] })
      .mockRejectedValueOnce(new Error('network_response_lost'))
      .mockRejectedValueOnce(new Error('network_still_unavailable'));
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));
    await act(async () => { await currentAuth.verifyPhoneOtp(phoneChallenge, '123456'); });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));

    await act(async () => {
      await currentAuth.deleteAccount({ method: 'password', password: 'password10' });
    });

    expect(currentAuth.accountDeletionPending).toBe(false);
    expect(currentAuth.accountRestoreUnavailable).toBe(true);
    expect(currentAuth.session).toBeUndefined();
    expect(mockClearPendingAccountDeletion).not.toHaveBeenCalled();
    expect(mockClearDeletedAccountLocalData).not.toHaveBeenCalled();
    expect(mockApiRequest).toHaveBeenLastCalledWith('/v1/account/deletion/status', expect.objectContaining({
      body: JSON.stringify({ idempotencyKey: pending.idempotencyKey }),
    }));
  });

  it('does not claim deletion is processing when secure storage fails after a lost DELETE response', async () => {
    mockReadPendingAccountDeletion
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('secure_storage_unavailable'));
    mockApiRequest
      .mockResolvedValueOnce({ accountId: 'phone-auth-user', phone: '+8613800138000', phoneBound: true, providers: ['phone'] })
      .mockRejectedValueOnce(new Error('network_response_lost'));
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));
    await act(async () => { await currentAuth.verifyPhoneOtp(phoneChallenge, '123456'); });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));

    await act(async () => {
      await currentAuth.deleteAccount({ method: 'password', password: 'password10' });
    });

    expect(currentAuth.accountDeletionPending).toBe(false);
    expect(currentAuth.accountRestoreUnavailable).toBe(true);
    expect(currentAuth.session).toBeUndefined();
    expect(mockClearPendingAccountDeletion).not.toHaveBeenCalled();
    expect(mockClearDeletedAccountLocalData).not.toHaveBeenCalled();
  });

  it('does not let status polling clear the receipt while the DELETE request is still in flight', async () => {
    let resolveDeletion!: (value: unknown) => void;
    const deletionResponse = new Promise((resolve) => { resolveDeletion = resolve; });
    mockApiRequest
      .mockResolvedValueOnce({ accountId: 'phone-auth-user', phone: '+8613800138000', phoneBound: true, providers: ['phone'] })
      .mockImplementationOnce(() => deletionResponse as never);
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));
    await act(async () => { await currentAuth.verifyPhoneOtp(phoneChallenge, '123456'); });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));

    let deletion!: Promise<void>;
    await act(async () => {
      deletion = currentAuth.deleteAccount({ method: 'password', password: 'password10' });
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(currentAuth.accountDeletionPending).toBe(true));
    await act(async () => { await currentAuth.resumeAccountDeletion(); });

    expect(mockApiRequest).toHaveBeenCalledTimes(2);
    expect(mockClearPendingAccountDeletion).not.toHaveBeenCalled();
    resolveDeletion({
      identityProviderOutcome: 'pending',
      jobId: '10000000-0000-4000-8000-000000000012',
      status: 'retryable',
    });
    await act(async () => { await deletion; });
    expect(currentAuth.accountDeletionPending).toBe(true);
    expect(currentAuth.session).toBeUndefined();
  });

  it('unlocks the current session only after a rejected DELETE is confirmed absent', async () => {
    const pending = {
      accountId: 'phone-auth-user',
      createdAt: Date.now(),
      idempotencyKey: '10000000-0000-4000-8000-000000000011',
    };
    mockReadPendingAccountDeletion.mockResolvedValueOnce(undefined).mockResolvedValueOnce(pending);
    mockApiRequest
      .mockResolvedValueOnce({ accountId: 'phone-auth-user', phone: '+8613800138000', phoneBound: true, providers: ['phone'] })
      .mockRejectedValueOnce(new ApiClientError('recent_auth_required', 403))
      .mockRejectedValueOnce(new ApiClientError('account_deletion_job_not_found', 404));
    const screen = await render(<AuthProvider><MockAuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));
    await act(async () => { await currentAuth.verifyPhoneOtp(phoneChallenge, '123456'); });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));
    let failure: unknown;

    await act(async () => {
      try {
        await currentAuth.deleteAccount({ method: 'password', password: 'password10' });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toEqual(expect.objectContaining({ message: 'recent_auth_required' }));
    expect(currentAuth.accountDeletionPending).toBe(false);
    expect(currentAuth.session?.user.id).toBe('phone-auth-user');
    expect(mockClearPendingAccountDeletion).toHaveBeenCalledTimes(1);
    expect(mockClearDeletedAccountLocalData).not.toHaveBeenCalled();
  });
});
