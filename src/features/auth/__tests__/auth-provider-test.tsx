import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { apiRequest } from '@/platform/api-client';
import { AuthProvider, useAuth } from '../AuthProvider';
import type { AppSession } from '../auth-service';

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockAuthorizePasswordRecovery = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignOut = jest.fn();
const mockUpdatePassword = jest.fn();
const mockVerifyPhoneOtp = jest.fn();

jest.mock('../auth-service', () => ({
  getAuthService: () => ({
    getSession: (...args: unknown[]) => mockGetSession(...args),
    onSessionChange: () => () => undefined,
    refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
    authorizePasswordRecovery: (...args: unknown[]) => mockAuthorizePasswordRecovery(...args),
    signInWithApple: (...args: unknown[]) => mockSignInWithApple(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
    updatePassword: (...args: unknown[]) => mockUpdatePassword(...args),
    verifyPhoneOtp: (...args: unknown[]) => mockVerifyPhoneOtp(...args),
  }),
}));

jest.mock('@/platform/api-client', () => ({
  apiFetch: jest.fn(),
  apiRequest: jest.fn(),
  setApiAccessTokenProvider: jest.fn(),
  setApiAuthRecovery: jest.fn(),
}));

jest.mock('@/features/ai/ai-client', () => ({ clearLocalAiConsent: jest.fn() }));

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
    mockApiRequest.mockReset();
    mockGetSession.mockReset().mockResolvedValue(undefined);
    mockRefreshSession.mockReset().mockResolvedValue(undefined);
    mockAuthorizePasswordRecovery.mockReset().mockResolvedValue({
      authorized: true,
      expiresAt: Date.now() + 600_000,
    });
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

  it('closes and clears a social session when account initialization fails', async () => {
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
    expect(mockSignOut).toHaveBeenCalledWith('local');
    expect(currentAuth.session).toBeUndefined();
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
    expect(mockUpdatePassword).toHaveBeenCalledWith('newpassword10', undefined);
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
});
