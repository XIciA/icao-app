import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const overlayPath = path.join(projectRoot, 'infra/supabase/docker-compose.testflight.yml');
const source = fs.readFileSync(overlayPath, 'utf8');

const required = [
  'GOTRUE_DISABLE_SIGNUP: "false"',
  'GOTRUE_EXTERNAL_PHONE_ENABLED: "true"',
  'GOTRUE_SMS_AUTOCONFIRM: "false"',
  'GOTRUE_SMS_OTP_LENGTH: "6"',
  'GOTRUE_PASSWORD_MIN_LENGTH: "8"',
  'GOTRUE_PASSWORD_REQUIRED_CHARACTERS: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789"',
  'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD: "true"',
  'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION: "true"',
  'ICAO_TESTFLIGHT_SMS_TEST_OTP:?',
  'ICAO_TESTFLIGHT_SMS_TEST_OTP_VALID_UNTIL:?',
];

for (const fragment of required) {
  if (!source.includes(fragment)) throw new Error(`unsafe_testflight_auth_overlay:missing:${fragment}`);
}

const forbidden = [
  'GOTRUE_SMS_AUTOCONFIRM: "true"',
  'GOTRUE_SMS_TWILIO_AUTH_TOKEN',
  'GOTRUE_SMS_MESSAGEBIRD_ACCESS_KEY',
  'GOTRUE_SMS_VONAGE_API_SECRET',
];

for (const fragment of forbidden) {
  if (source.includes(fragment)) throw new Error(`unsafe_testflight_auth_overlay:forbidden:${fragment}`);
}

console.log('TestFlight phone-auth overlay is fail-closed and uses expiring allowlisted OTPs.');
