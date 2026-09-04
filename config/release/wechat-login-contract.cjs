'use strict';

const APPROVED = 'approved';
const WAITING_HUMAN = 'WAITING_HUMAN';

function normalizeWechatLoginCredentials(configuration = {}) {
  const appId = typeof configuration.appId === 'string' ? configuration.appId.trim() : '';
  const universalLink = typeof configuration.universalLink === 'string'
    ? configuration.universalLink.trim()
    : '';
  if (Boolean(appId) !== Boolean(universalLink)) {
    throw new Error('wechat_app_id_and_universal_link_must_be_configured_together');
  }
  if (!appId) return Object.freeze({ appId: '', universalLink: '' });
  if (!/^wx[0-9a-z]{6,}$/iu.test(appId)) throw new Error('wechat_app_id_invalid');

  let parsed;
  try {
    parsed = new URL(universalLink);
  } catch {
    throw new Error('wechat_universal_link_invalid');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !parsed.hostname
    || !parsed.pathname.endsWith('/')
  ) {
    throw new Error('wechat_universal_link_must_be_credential_free_https_directory');
  }
  return Object.freeze({ appId, universalLink });
}

function resolveWechatLoginReleaseCapability(configuration = {}) {
  if (configuration.schemaVersion !== 1) throw new Error('wechat_release_schema_invalid');
  if (configuration.status === WAITING_HUMAN) {
    if (configuration.appId !== null || configuration.universalLink !== null) {
      throw new Error('pending_wechat_release_must_not_contain_credentials');
    }
    return Object.freeze({ appId: '', enabled: false, mode: 'pending', universalLink: '' });
  }
  if (configuration.status !== APPROVED) throw new Error('wechat_release_status_invalid');
  const credentials = normalizeWechatLoginCredentials(configuration);
  if (!credentials.appId) throw new Error('approved_wechat_release_credentials_missing');
  return Object.freeze({ ...credentials, enabled: true, mode: APPROVED });
}

module.exports = {
  normalizeWechatLoginCredentials,
  resolveWechatLoginReleaseCapability,
};
