import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiClientError, apiRequest } from '@/platform/api-client';
import { AuthProvider, useAuth } from '../AuthProvider';
import type { AppSession } from '../auth-service';

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockAuthorizePasswordRecovery = jest.fn();
const mockAuthorizeAccountDeletionWithPassword = jest.fn();
const mockAuthorizeAccountDeletionWithApple = jest.fn();
const mockAuthorizeAccountDeletionWithPhoneOtp = jest.fn();
const mockRequestAccountDeletionPhoneOtp = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignOut = jest.fn();
const mockUpdatePassword = jest.fn();
const mockVerifyPhoneOtp = jest.fn();
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
    authorizeAccountDeletionWithPhoneOtp: (...args: unknown[]) => mockAuthorizeAccountDeletionWithPhoneOtp(...args),
    requestAccountDeletionPhoneOtp: (...args: unknown[]) => mockRequestAccountDeletionPhoneOtp(...args),
    signInWithApple: (...args: unknown[]) => mockSignInWithApple(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
    updatePassword: (...args: unknown[]) => mockUpdatePassword(...args),
    verifyPhoneOtp: (...args: unknown[]) => mockVerifyPhoneOtp(...args),
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
    setApiAccessTokenProvider: jest.fn(),
    setApiAuthRecovery: jest.fn(),
  };
});

jest.mock('@/features/ai/ai-client', () => ({ clearLocalAiConsent: jest.fn() }));

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

jest.mock('@/features/sync/learning-sync', () => ({
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

let currentAuth: ReturnType<typeof useAuth>;

function AuthStateProbe() {
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
    mockApiRequest.mockReset();
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
  });

  it('does not open business screens until the permanent account is initialized', async () => {
    let resolveAccount!: (value: unknown) => void;
    mockApiRequest.mockImplementationOnce(() => new Promise((resolve) => { resolveAccount = resolve; }));
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
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

  it('does not let a stale startup restore clear a newer OTP login', async () => {
    let resolveStartupSession!: (value: AppSession | undefined) => void;
    mockGetSession.mockImplementationOnce(() => new Promise((resolve) => { resolveStartupSession = resolve; }));
    mockApiRequest.mockResolvedValueOnce({
      accountId: 'phone-auth-user',
      phone: '+8613800138000',
      phoneBound: true,
      providers: ['phone'],
    });
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);

    await act(async () => {
      await currentAuth.verifyPhoneOtp('+8613800138000', '123456');
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.restoring).toBe(false));

    await act(async () => {
      await currentAuth.verifyPhoneOtp('+8613800138000', '123456');
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

    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/deletion/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: '10000000-0000-4000-8000-000000000011' }),
    });
    expect(mockClearDeletedAccountLocalData).toHaveBeenCalledTimes(1);
    expect(mockClearPendingAccountDeletion).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith('local');
  });

  it('reports secure-store startup failures without claiming that account deletion is in progress', async () => {
    mockReadPendingAccountDeletion.mockRejectedValueOnce(new Error('secure_storage_unavailable'));

    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
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

    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
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

    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
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

    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.accountDeletionPending).toBe(true));

    expect(screen.getByTestId('auth-state').props.children).toBe('closed');
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockClearDeletedAccountLocalData).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('preserves a verified session behind the restore gate when account initialization fails', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('api_http_503'));
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp('+8613800138000', '123456', 'recovery');
    });
    expect(mockAuthorizePasswordRecovery).toHaveBeenCalledTimes(1);
    expect(currentAuth.passwordChangePurpose).toBe('recovery');

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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    let failure: unknown;
    await act(async () => {
      try {
        await currentAuth.verifyPhoneOtp('+8613800138000', '123456', 'recovery');
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp('+8613800138000', '123456', 'recovery');
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp('+8613800138000', '123456', 'recovery');
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp('+8613800138000', '123456', 'recovery');
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp('+8613800138000', '123456');
    });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));
    await act(async () => {
      await currentAuth.deleteAccount({ password: 'password10' });
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

  it('blocks the app and preserves local data while an accepted deletion is still processing', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ accountId: 'phone-auth-user', phone: '+8613800138000', phoneBound: true, providers: ['phone'] })
      .mockResolvedValueOnce({
        identityProviderOutcome: 'pending',
        jobId: '10000000-0000-4000-8000-000000000012',
        status: 'retryable',
      });
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));

    await act(async () => {
      await currentAuth.verifyPhoneOtp('+8613800138000', '123456');
    });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));
    await act(async () => {
      await currentAuth.deleteAccount({ password: 'password10' });
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));
    await act(async () => { await currentAuth.verifyPhoneOtp('+8613800138000', '123456'); });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));

    await act(async () => {
      await currentAuth.deleteAccount({ password: 'password10' });
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));
    await act(async () => { await currentAuth.verifyPhoneOtp('+8613800138000', '123456'); });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));

    await act(async () => {
      await currentAuth.deleteAccount({ password: 'password10' });
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));
    await act(async () => { await currentAuth.verifyPhoneOtp('+8613800138000', '123456'); });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));

    let deletion!: Promise<void>;
    await act(async () => {
      deletion = currentAuth.deleteAccount({ password: 'password10' });
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
    const screen = await render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('closed'));
    await act(async () => { await currentAuth.verifyPhoneOtp('+8613800138000', '123456'); });
    await waitFor(() => expect(currentAuth.account?.accountId).toBe('phone-auth-user'));
    let failure: unknown;

    await act(async () => {
      try {
        await currentAuth.deleteAccount({ password: 'password10' });
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
