import { authError } from '../auth-service';

describe('auth rules', () => {
  it('classifies network, service, and browser-storage authentication failures', () => {
    expect(authError({ message: 'Failed to fetch' }).message).toBe('auth_network_error');
    expect(authError({ code: 'unexpected_failure', message: 'Unexpected failure' }).message).toBe('auth_service_unavailable');
    expect(authError({ message: 'localStorage is not available' }).message).toBe('auth_session_storage_unavailable');
    expect(authError({ code: 'auth_failed', message: 'Authentication failed' }).message).toBe('auth_request_not_completed');
    expect(authError({ message: 'Invalid login credentials' }).message).toBe('invalid_invite_code');
  });
});
