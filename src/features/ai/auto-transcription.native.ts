import Storage from '@/platform/storage';
import { getNativeCommerceEnvironmentState } from '@/features/native-commercial-testflight/commerce-environment.native';

export function autoTranscriptionOwnerKey() {
  const owner = getNativeCommerceEnvironmentState();
  return owner.status === 'active' && owner.accountId
    ? `icao.ai.auto-transcription.v1.${owner.accountId}.${owner.environment}` : undefined;
}
/** A device preference, scoped to the existing signed-in account/environment. */
export async function autoTranscriptionEnabled() {
  const key = autoTranscriptionOwnerKey();
  return Boolean(key && await Storage.getItem(key) === 'enabled' && key === autoTranscriptionOwnerKey());
}
export async function autoTranscriptionAcknowledged() {
  const key = autoTranscriptionOwnerKey();
  const value = key ? await Storage.getItem(key) : null;
  return Boolean(key && key === autoTranscriptionOwnerKey() && (value === 'enabled' || value === 'disabled-after-consent'));
}
export async function setAutoTranscriptionEnabled(enabled: boolean, expectedOwner = autoTranscriptionOwnerKey()) {
  const key = autoTranscriptionOwnerKey();
  if (key !== expectedOwner) throw new Error('learning_owner_or_generation_changed');
  if (!key) throw new Error('commerce_environment_unavailable');
  const acknowledged = await autoTranscriptionAcknowledged();
  if (key !== autoTranscriptionOwnerKey()) throw new Error('learning_owner_or_generation_changed');
  await Storage.setItem(key, enabled ? 'enabled' : acknowledged ? 'disabled-after-consent' : 'disabled');
  if (key !== autoTranscriptionOwnerKey()) throw new Error('learning_owner_or_generation_changed');
}
